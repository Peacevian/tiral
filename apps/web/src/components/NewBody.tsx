"use client"

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { createPortal, useFrame } from "@react-three/fiber"
import { useGLTF } from "@react-three/drei"
import * as THREE from "three"
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js"
import { resolveLoadout, type AvatarLoadout, type Body, type HairStyle } from "@tiral/avatars"
import { MergeStatic } from "@/components/MergeStatic"
import { beatsAt, danceFrame, type DanceFrame, type DanceState } from "@/lib/dance/moves"
import { newBodiesOn } from "@/lib/newBodies"
import {
  BODA_VEST_COLOR,
  CRANES_YELLOW,
  KANZU_COLOR,
  Backpack,
  CranesBadge,
  Glasses,
  GomesiShoulder,
  Hair,
  Hood,
  JerseyNumber,
  RealisticHat,
  Robe,
  useNumberTexture
} from "./avatarParts"
import { applyDanceFrame, applyRidePose, resetDanceBones, type PoseRig, type RidePose, type Skeleton } from "./avatarPose"
import type { AvatarAct, AvatarPose } from "./RealisticAvatar"

// The realistic young man and woman, made from code (scripts/characters),
// with Mixamo's animations baked in. Drawn by RealisticAvatar instead of the
// old model when the switch is on (lib/newBodies). Feet at y=0, facing +Z
// like the old model. They wear the old model's add-ons (avatarParts), mapped
// from its body onto theirs at points measured on each model.
// Versioned names: served with a one-year immutable cache (next.config.ts).

type Vec3 = [number, number, number]
/** Where an add-on goes on a body, and how much smaller it is there than on the old model. */
type Spot = { at: Vec3; scale: number }

type Fit = {
  url: string
  /** MakeHuman's young bodies come out short (1.60 m, 1.40 m): up to 1.72 m and 1.62 m. */
  scale: number
  /** Centre of the skull, and the head's size against the add-ons' unit head (radius 0.21). */
  head: Spot
  back: Spot
  chest: Spot
  neck: Spot
  hips: Spot
  /** The left shoulder joint (the right mirrors it). */
  shoulder: Spot
}

const FITS: Record<Body, Fit> = {
  male: {
    url: "/models/young-man-v4.glb",
    scale: 1.075,
    head: { at: [0, 1.505, 0.05], scale: 0.44 },
    back: { at: [0, 1.21, -0.095], scale: 0.85 },
    chest: { at: [0, 1.22, 0.165], scale: 0.85 },
    neck: { at: [0, 1.361, 0.013], scale: 0.86 },
    hips: { at: [0, 0.884, 0.016], scale: 0.86 },
    shoulder: { at: [0.172, 1.262, 0.017], scale: 0.86 }
  },
  female: {
    url: "/models/young-woman-v4.glb",
    scale: 1.14,
    head: { at: [0, 1.338, 0.03], scale: 0.405 },
    back: { at: [0, 1.04, -0.075], scale: 0.75 },
    chest: { at: [0, 1.1, 0.14], scale: 0.75 },
    neck: { at: [0, 1.191, 0.002], scale: 0.77 },
    hips: { at: [0, 0.764, 0.023], scale: 0.77 },
    shoulder: { at: [0.137, 1.114, 0.016], scale: 0.77 }
  }
}
// The same points on the old model, where the add-ons were made to sit.
const OLD: Record<Exclude<keyof Fit, "url" | "scale" | "head">, Vec3> = {
  back: [0, 1.27, -0.07],
  chest: [0, 1.3, 0.19],
  neck: [0, 1.511, 0.043],
  hips: [0, 0.894, 0.06],
  shoulder: [0.2, 1.46, 0.06]
}
// The old head's hat and glasses, against its head centre, at its head scale.
const OLD_HEAD_SCALE = 0.56
const HAT_OFFSET: Vec3 = [0, -0.02, -0.005]
// The new heads' real hair goes under a hat (it would swallow a cap's crown),
// and the hats are a touch wider than on the old head.
const HAT_SCALE = (0.5 / OLD_HEAD_SCALE) * 1.05
const GLASSES_OFFSET: Vec3 = [0, -0.008, 0.015]

export const BODY_MODELS: Record<Body, string> = { male: FITS.male.url, female: FITS.female.url }

const CLIPS = {
  idle: "breathing_idle",
  walk: "walking",
  run: "running",
  dance: "victory"
} as const

const ACT_CLIPS: Record<AvatarAct, string> = {
  calm: "breathing_idle",
  phone: "texting_while_standing",
  flinch: "hit_reaction",
  shock: "hit_reaction",
  collapse: "defeated",
  run: "running",
  wave: "waving"
}
// Beats that play once and hold their last pose.
const ONE_SHOT_ACTS: ReadonlySet<AvatarAct> = new Set(["flinch", "shock", "collapse"])

// The tintable materials (named "<who>.<part>" by make_hero.py; hair as
// "<who>.hair-<style>"). Their textures are light grey shading averaging 0.92
// (sRGB, ~0.83 linear), so the colour is lifted to come out as picked.
type Part = "top" | "bottom" | "body" | "shoes" | "hair"
const PARTS: readonly Part[] = ["top", "bottom", "body", "shoes", "hair"]
const LIFT = 1.2
/** Hair styles the models carry as real hair; the rest are drawn from shapes. */
const MODEL_HAIR: ReadonlySet<HairStyle> = new Set(["short", "afro"])
const BONES = { head: "mixamorigHead", spine: "mixamorigSpine2", neck: "mixamorigNeck", hips: "mixamorigHips" }

const SIDES = { L: "Left", R: "Right" } as const
/** A point added 20 cm above the head (Mixamo has no head tip), to aim it by. */
const HEAD_TIP = "headTip"
/** Longer arms from lower shoulders than the old model's: reach up and in to the grips. */
const RIDER_ARMS = { upper: [0.3, -0.85, 0.45], fore: [-0.05, 0, 1] }
/** Where the old model's hips are at rest: seated on a boda, the new bodies' hips go there (the bike is built round it). */
const OLD_HIPS_Y = 0.894

/** Mixamo's bones, for the hand-made poses (avatarPose). The hips are the root here, so they also carry the body up and down. */
const SKELETON: Skeleton = {
  torso: "mixamorigSpine",
  neck: "mixamorigNeck",
  head: "mixamorigHead",
  headTip: HEAD_TIP,
  hips: "mixamorigHips",
  body: "mixamorigHips",
  upperArm: (side) => `mixamorig${SIDES[side]}Arm`,
  lowerArm: (side) => `mixamorig${SIDES[side]}ForeArm`,
  wrist: (side) => `mixamorig${SIDES[side]}Hand`,
  upperLeg: (side) => `mixamorig${SIDES[side]}UpLeg`,
  lowerLeg: (side) => `mixamorig${SIDES[side]}Leg`,
  ankle: (side) => `mixamorig${SIDES[side]}Foot`
}

export function NewBody({
  loadout,
  moving,
  pose = "auto",
  gait = "walk",
  act,
  ride,
  dance,
  posed,
  noBackpack,
  clip: chosen
}: {
  loadout: AvatarLoadout
  moving: boolean
  pose?: AvatarPose
  gait?: "walk" | "run"
  act?: AvatarAct
  /** Seated on a boda (rider or passenger); hips at the old model's seat height. */
  ride?: RidePose
  /** A dance routine playing to a beat (overrides pose and moving). */
  dance?: DanceState | null
  /** An exact pose, read every frame (scripted scenes such as the intro video). */
  posed?: { current: DanceFrame | null }
  /** Leave the backpack off (scripted scenes: Mum at home). */
  noBackpack?: boolean
  /** Any clip in the file, by name, over the above (the /dev/hero bench). */
  clip?: string
}) {
  const resolved = resolveLoadout(loadout)
  const fit = FITS[resolved.body]
  const { scene, animations } = useGLTF(fit.url)
  const rig = useMemo(() => {
    const model = clone(scene)
    const materials = new Map<Part, THREE.MeshStandardMaterial[]>()
    const hair = new Map<string, THREE.Mesh[]>()
    const trousers: THREE.Mesh[] = []
    model.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      // Skinned meshes' bounds are their rest pose: a raised arm or a
      // crouch would be culled at the screen's edge.
      mesh.frustumCulled = false
      const material = mesh.material as THREE.MeshStandardMaterial
      const part = PARTS.find((p) => material.name.endsWith(`.${p}`) || material.name.includes(`.${p}-`))
      if (!part) return
      // This player's own copy, to tint.
      mesh.material = material.clone()
      materials.set(part, [...(materials.get(part) ?? []), mesh.material as THREE.MeshStandardMaterial])
      if (part === "hair") {
        const style = material.name.split("hair-")[1] ?? ""
        hair.set(style, [...(hair.get(style) ?? []), mesh])
      }
      if (part === "bottom") trousers.push(mesh)
    })
    // Each bone's rest pose against the model, inverted: an add-on placed in
    // model space inside the bone then follows it (as OnBone in RealisticAvatar).
    model.updateMatrixWorld(true)
    const mounts = new Map<string, { bone: THREE.Object3D; inverse: THREE.Matrix4 }>()
    for (const name of [...Object.values(BONES), "mixamorigLeftArm", "mixamorigRightArm"]) {
      const bone = model.getObjectByName(name)
      if (bone) mounts.set(name, { bone, inverse: bone.matrixWorld.clone().invert() })
    }
    // For the hand-made poses: every bone by name, plus the head's tip.
    const bones = new Map<string, THREE.Object3D>()
    model.traverse((object) => {
      if ((object as THREE.Bone).isBone) bones.set(object.name, object)
    })
    const head = bones.get(SKELETON.head)
    if (head) {
      const tip = new THREE.Object3D()
      tip.name = HEAD_TIP
      tip.position.copy(head.worldToLocal(head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.2, 0))))
      head.add(tip)
      bones.set(HEAD_TIP, tip)
    }
    const hips = bones.get(SKELETON.hips)
    const ankleY = (["L", "R"] as const).map((side) => bones.get(SKELETON.ankle(side))?.getWorldPosition(new THREE.Vector3()).y ?? Infinity)
    const pose: PoseRig = {
      root: model,
      bones,
      skeleton: SKELETON,
      legEndY: Math.min(...ankleY),
      bodyBind: hips?.position.clone() ?? null,
      hipsBind: hips?.quaternion.clone() ?? null,
      riderArms: RIDER_ARMS
    }
    return { model, materials, hair, trousers, mounts, pose }
  }, [scene])
  useEffect(() => () => rig.materials.forEach((list) => list.forEach((m) => m.dispose())), [rig])

  const { outfit, shirt, pants, skin, shoes, hair, hairColor, hat, glasses } = resolved
  const robed = outfit === "kanzu" || outfit === "gomesi"
  useLayoutEffect(() => {
    const colours: Record<Part, string> = {
      top: outfit === "kanzu" ? KANZU_COLOR : outfit === "cranes" ? CRANES_YELLOW : outfit === "bodavest" ? BODA_VEST_COLOR : shirt,
      bottom: pants,
      body: skin,
      shoes,
      hair: hairColor
    }
    for (const part of PARTS) for (const material of rig.materials.get(part) ?? []) material.color.set(colours[part]).multiplyScalar(LIFT)
    // The player's hair style, if the model has it (none under a hat).
    for (const [style, meshes] of rig.hair) for (const mesh of meshes) mesh.visible = style === hair && hat === "none"
    // Robes hang from the hips; hiding the trousers stops striding legs
    // poking through the cloth (the shoes still show under the hem).
    for (const mesh of rig.trousers) mesh.visible = !robed
  }, [rig, outfit, shirt, pants, skin, shoes, hair, hairColor, hat, robed])

  // Our own mixer, made with the model: drei's useAnimations keeps actions
  // bound to the first model it saw, so a new copy (another body, or a hot
  // reload) stood frozen in its rest pose while an unseen one ran.
  const mixer = useMemo(() => new THREE.AnimationMixer(rig.model), [rig])
  useEffect(() => () => void mixer.stopAllAction(), [mixer])
  useFrame((_, delta) => mixer.update(delta))

  const clip =
    chosen ?? (act ? ACT_CLIPS[act] : ride || dance || posed ? CLIPS.idle : pose === "dance" ? CLIPS.dance : moving ? CLIPS[gait] : CLIPS.idle)
  useEffect(() => {
    const found = THREE.AnimationClip.findByName(animations, clip)
    if (!found) return
    const action = mixer.clipAction(found)
    const once = !!act && ONE_SHOT_ACTS.has(act)
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
    action.clampWhenFinished = once
    action.reset().fadeIn(0.25).play()
    return () => {
      action.fadeOut(0.25)
    }
  }, [mixer, animations, clip, act])

  // The hand-made poses, after the mixer has applied this frame's idle clip
  // (registered after it, so they run after it): a dance routine's (or a
  // scripted scene's) frame, or seated on a boda.
  const spin = useRef<THREE.Group>(null)
  const danced = useRef(false)
  useFrame(() => {
    const frame = posed?.current ?? (dance && !act && !ride ? danceFrame(dance.routine, beatsAt(dance, performance.now())) : null)
    if (frame) {
      applyDanceFrame(rig.pose, frame)
      spin.current?.position.set(frame.shiftX, 0, 0)
      spin.current?.rotation.set(0, frame.yaw, 0)
      danced.current = true
      return
    }
    if (danced.current) {
      // Stopped dancing: hand the bones the dance moved back to the clips.
      resetDanceBones(rig.pose)
      spin.current?.position.set(0, 0, 0)
      spin.current?.rotation.set(0, 0, 0)
      danced.current = false
    }
    if (ride && !act) applyRidePose(rig.pose, ride)
  })
  // Seated: the hips at the old model's seat height (in this body's units).
  const seatDrop = ride && rig.pose.bodyBind ? OLD_HIPS_Y / fit.scale - rig.pose.bodyBind.y : 0

  const numberTexture = useNumberTexture(outfit === "jersey")
  // Everything the add-ons depend on (they're merged into one mesh per material).
  const version = JSON.stringify([loadout, !!noBackpack, !!ride])
  const on = (bone: string, children: ReactNode) => {
    const target = rig.mounts.get(bone)
    if (!target) return null
    return createPortal(
      <group matrix={target.inverse} matrixAutoUpdate={false}>
        <MergeStatic version={version}>{children}</MergeStatic>
      </group>,
      target.bone
    )
  }
  const { head } = fit
  const headAt = (offset: Vec3) => head.at.map((v, i) => v + offset[i]! * (head.scale / OLD_HEAD_SCALE)) as Vec3

  return (
    <group scale={fit.scale}>
      {/* The add-ons below ride on the bones, so they follow these too. */}
      <group position={[0, seatDrop, 0]}>
        <group ref={spin}>
          <primitive object={rig.model} />
        </group>
      </group>
      {on(
        BONES.head,
        <>
          {!MODEL_HAIR.has(hair) && (
            <group position={head.at} scale={head.scale}>
              <Hair style={hair} color={hairColor} hat={hat} />
            </group>
          )}
          <group position={headAt(HAT_OFFSET)} scale={head.scale * HAT_SCALE}>
            <RealisticHat style={hat} color={resolved.hatColor} />
          </group>
          <group position={headAt(GLASSES_OFFSET)} scale={head.scale}>
            <Glasses style={glasses} />
          </group>
        </>
      )}
      {on(
        BONES.spine,
        <>
          {/* Seated on a boda, a backpack would push into whoever sits behind. */}
          {!ride && !noBackpack && (
            <Moved from={OLD.back} to={fit.back}>
              <Backpack color={resolved.backpack} straps={false} />
            </Moved>
          )}
          {outfit === "jersey" && numberTexture && (
            <Moved from={OLD.chest} to={fit.chest}>
              <JerseyNumber texture={numberTexture} />
            </Moved>
          )}
          {outfit === "cranes" && (
            <Moved from={OLD.chest} to={fit.chest}>
              <CranesBadge />
            </Moved>
          )}
        </>
      )}
      {outfit === "hoodie" &&
        on(
          BONES.neck,
          <Moved from={OLD.neck} to={fit.neck}>
            <Hood color={shirt} />
          </Moved>
        )}
      {robed &&
        on(
          BONES.hips,
          <Moved from={OLD.hips} to={fit.hips}>
            <Robe outfit={outfit} color={outfit === "kanzu" ? KANZU_COLOR : shirt} />
          </Moved>
        )}
      {outfit === "gomesi" &&
        ([1, -1] as const).map((side) => (
          <Fragment key={side}>
            {on(
              side === 1 ? "mixamorigLeftArm" : "mixamorigRightArm",
              <Moved
                from={[side * OLD.shoulder[0], OLD.shoulder[1], OLD.shoulder[2]]}
                to={{ ...fit.shoulder, at: [side * fit.shoulder.at[0], fit.shoulder.at[1], fit.shoulder.at[2]] }}
              >
                <GomesiShoulder side={side} color={shirt} />
              </Moved>
            )}
          </Fragment>
        ))}
    </group>
  )
}

/** Moves an add-on made at `from` on the old model to a spot on this body. */
function Moved({ from, to, children }: { from: Vec3; to: Spot; children: ReactNode }) {
  return (
    <group position={to.at} scale={to.scale}>
      <group position={[-from[0], -from[1], -from[2]]}>{children}</group>
    </group>
  )
}

if (newBodiesOn()) for (const url of Object.values(BODY_MODELS)) useGLTF.preload(url)
