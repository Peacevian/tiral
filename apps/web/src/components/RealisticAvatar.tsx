"use client"

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { createPortal, useFrame } from "@react-three/fiber"
import { useAnimations, useGLTF } from "@react-three/drei"
import * as THREE from "three"
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js"
import { MergeStatic } from "@/components/MergeStatic"
import { newBodiesOn } from "@/lib/newBodies"
import { beatsAt, danceFrame, type DanceFrame, type DanceState } from "@/lib/dance/moves"
import { resolveLoadout, type AvatarLoadout, type Outfit } from "@tiral/avatars"
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
import { applyDanceFrame, applyRidePose, resetDanceBones, rootSpace, type PoseRig, type RidePose, type Skeleton } from "./avatarPose"
import { CrowdBody } from "./CrowdBody"
import { NewBody } from "./NewBody"

// Rigged human: "Casual Character" by Quaternius (CC0), see public/models/CREDITS.md.
// Rest (bind) pose is a T-pose about 1.85 tall, feet at y=0, facing +Z.
// Versioned name: served with a one-year immutable cache (next.config.ts).
const MODEL_URL = "/models/runner-v2.glb"
// Only when it's the one drawn (the new bodies replace it when switched on).
if (!newBodiesOn()) useGLTF.preload(MODEL_URL)

/** Scripted beats for storytelling scenes (the landing hero). */
export const ACT_CLIPS = {
  calm: "CharacterArmature|Idle_Neutral",
  phone: "CharacterArmature|Interact",
  flinch: "CharacterArmature|HitRecieve",
  shock: "CharacterArmature|HitRecieve_2",
  collapse: "CharacterArmature|Death",
  run: "CharacterArmature|Run",
  wave: "CharacterArmature|Wave"
} as const
export type AvatarAct = keyof typeof ACT_CLIPS
// Beats that play once and hold their last pose.
const ONE_SHOT_ACTS: ReadonlySet<AvatarAct> = new Set(["phone", "flinch", "shock", "collapse"])

const CLIPS = {
  idle: "CharacterArmature|Idle",
  walk: "CharacterArmature|Walk",
  run: "CharacterArmature|Run",
  dance: "CharacterArmature|Wave"
} as const

// Where accessories sit in the bind pose (model space), measured from the GLB.
// The procedural hats/hair/glasses were authored for a head of radius 0.21
// centred on the origin, so they're scaled down to this head.
const HEAD_CENTER = new THREE.Vector3(0, 1.68, 0.055)
const HEAD_SCALE = 0.56
// Hats sit a touch lower and tighter than the hair so brims hug the head.
const HAT_POSITION = new THREE.Vector3(0, 1.66, 0.05)
const HAT_SCALE = 0.5
// ---------------------------------------------------------------------------
// Outfit painting. Each vertex carries its bind-pose position/normal
// (bodyPos/bodyNormal), so patterns stay glued to the body while it animates.
// Regions: 0 = shirt, 1 = arm skin (sleeves), 2 = trousers.

const TOP_MODE: Record<Outfit, number> = {
  shirt: 0,
  jersey: 1,
  tracksuit: 2,
  hoodie: 3,
  kitenge: 4,
  bodavest: 5,
  kanzu: 6,
  gomesi: 7,
  cranes: 8
}

const PATTERN_GLSL = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uAccent;
uniform int uMode;
varying vec3 vBodyPos;
varying vec3 vBodyNormal;

vec3 tiralColor(vec3 p, vec3 n) {
  vec3 c = uBase;
  float ax = abs(p.x);
  bool front = n.z > 0.35;
#if TIRAL_REGION == 0
  if (uMode == 0) {
    // buttons down the placket
    if (front && ax < 0.011 && p.y > 1.18 && p.y < 1.48 && mod(p.y - 1.18, 0.09) < 0.016) c = vec3(0.85);
  } else if (uMode == 1) {
    // jersey: white collar and sleeve hems
    if (p.y > 1.5 || ax > 0.25) c = vec3(1.0);
  } else if (uMode == 2) {
    // tracksuit zip
    if (front && ax < 0.007) c = vec3(0.8);
  } else if (uMode == 3) {
    // hoodie kangaroo pocket
    if (front && ax < 0.11 && p.y > 1.04 && p.y < 1.17) c = uBase * 0.72;
  } else if (uMode == 4) {
    // kitenge wax print: rings on cream with ochre diamonds
    float cell = 0.07;
    float row = floor(p.y / cell);
    vec2 f = fract(vec2(p.x + p.z * 0.6 + mod(row, 2.0) * cell * 0.5, p.y) / cell) - 0.5;
    float r = length(f);
    c = vec3(0.99, 0.9, 0.57);
    if (abs(f.x) + abs(f.y) > 0.42) c = vec3(0.46, 0.09, 0.01);
    if (r < 0.32) c = uBase;
    if (r < 0.13) c = vec3(0.012, 0.01, 0.008);
  } else if (uMode == 5) {
    // boda vest over the shirt, reflective bands
    if (ax < 0.2) {
      c = uAccent;
      if ((p.y > 1.17 && p.y < 1.205) || (p.y > 1.37 && p.y < 1.405)) c = vec3(0.78);
    }
  } else if (uMode == 6) {
    // kanzu: embroidered placket and collar in the accent colour
    c = uBase;
    if ((front && ax < 0.013 && p.y > 1.28) || p.y > 1.51) c = uAccent;
  } else if (uMode == 8) {
    // Cranes kit: black and red chest bands, black collar, red cuffs
    if (p.y > 1.38 && p.y < 1.43) c = vec3(0.006, 0.009, 0.021);
    if (p.y > 1.31 && p.y < 1.36) c = vec3(0.72, 0.02, 0.02);
    if (p.y > 1.505) c = vec3(0.006, 0.009, 0.021);
    if (ax > 0.255) c = vec3(0.72, 0.02, 0.02);
  }
#elif TIRAL_REGION == 1
  // arms (T-pose: wrists at |x| ~0.57). uBase = skin, uAccent = sleeve.
  if (uMode >= 1 && ax < 0.555) {
    c = uAccent;
    if (uMode == 2 && n.y > 0.8) c = vec3(0.92);
  }
#else
  // trousers; tracksuit gets a stripe down the outside of each leg
  if (uMode == 1 && ax > 0.163 && n.x * sign(p.x) > 0.55) c = vec3(0.92);
#endif
  return c;
}
`

type PatternUniforms = {
  uBase: { value: THREE.Color }
  uAccent: { value: THREE.Color }
  uMode: { value: number }
}

function makePatternMaterial(source: THREE.Material, region: 0 | 1 | 2): THREE.MeshStandardMaterial {
  const material = (source as THREE.MeshStandardMaterial).clone()
  const uniforms: PatternUniforms = {
    uBase: { value: new THREE.Color() },
    uAccent: { value: new THREE.Color() },
    uMode: { value: 0 }
  }
  material.userData.pattern = uniforms
  material.defines = { ...(material.defines ?? {}), TIRAL_REGION: region }
  material.customProgramCacheKey = () => `tiral-pattern-${region}`
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec3 bodyPos;\nattribute vec3 bodyNormal;\nvarying vec3 vBodyPos;\nvarying vec3 vBodyNormal;"
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBodyPos = bodyPos;\nvBodyNormal = bodyNormal;")
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${PATTERN_GLSL}`)
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb = tiralColor(vBodyPos, normalize(vBodyNormal));"
      )
  }
  return material
}

/** Bake bind-pose position/normal into each skinned geometry (once per GLB). */
function prepareBodyAttributes(scene: THREE.Object3D) {
  if (scene.userData.tiralPrepared) return
  scene.updateMatrixWorld(true)
  const v = new THREE.Vector3()
  const normalMatrix = new THREE.Matrix3()
  scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    const geometry = mesh.geometry
    const position = geometry.getAttribute("position")
    const normal = geometry.getAttribute("normal")
    const bodyPos = new Float32Array(position.count * 3)
    const bodyNormal = new Float32Array(position.count * 3)
    normalMatrix.getNormalMatrix(mesh.matrixWorld)
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
      bodyPos.set([v.x, v.y, v.z], i * 3)
      if (normal) {
        v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize()
        bodyNormal.set([v.x, v.y, v.z], i * 3)
      }
    }
    geometry.setAttribute("bodyPos", new THREE.BufferAttribute(bodyPos, 3))
    geometry.setAttribute("bodyNormal", new THREE.BufferAttribute(bodyNormal, 3))
  })
  scene.userData.tiralPrepared = true
}

type Parts = {
  top: THREE.MeshStandardMaterial[]
  arms: THREE.MeshStandardMaterial[]
  legs: THREE.MeshStandardMaterial[]
  skin: THREE.MeshStandardMaterial[]
  skinShade: THREE.MeshStandardMaterial[]
  hair: THREE.MeshStandardMaterial[]
  brows: THREE.MeshStandardMaterial[]
  shoes: THREE.MeshStandardMaterial[]
  hairMeshes: THREE.Object3D[]
  legMeshes: THREE.Object3D[]
}

/** Clone the rig for this avatar and give it its own recolourable materials. */
function instantiate(scene: THREE.Object3D) {
  prepareBodyAttributes(scene)
  const root = SkeletonUtils.clone(scene)
  const parts: Parts = { top: [], arms: [], legs: [], skin: [], skinShade: [], hair: [], brows: [], shoes: [], hairMeshes: [], legMeshes: [] }
  const bones = new Map<string, THREE.Bone>()
  let skeleton: THREE.Skeleton | null = null

  root.traverse((object) => {
    // Leaf markers like "LowerLeg.L_end" are plain nodes, not bones; keep them
    // too (the seated poses aim shins at them).
    if ((object as THREE.Bone).isBone || object.name.endsWith("_end")) bones.set(object.name, object as THREE.Bone)
    const mesh = object as THREE.SkinnedMesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    // Bounds come from the T-pose; animated limbs leave them, so never cull.
    mesh.frustumCulled = false
    if (mesh.isSkinnedMesh && !skeleton) skeleton = mesh.skeleton
    const source = mesh.material as THREE.MeshStandardMaterial
    const isBody = mesh.name.startsWith("Casual2_Body")
    switch (source.name) {
      case "LightBrown":
        mesh.material = makePatternMaterial(source, 0)
        parts.top.push(mesh.material as THREE.MeshStandardMaterial)
        break
      case "Skin":
        if (isBody) {
          mesh.material = makePatternMaterial(source, 1)
          parts.arms.push(mesh.material as THREE.MeshStandardMaterial)
        } else {
          mesh.material = source.clone()
          parts.skin.push(mesh.material as THREE.MeshStandardMaterial)
        }
        break
      case "LightBlue":
        mesh.material = makePatternMaterial(source, 2)
        parts.legs.push(mesh.material as THREE.MeshStandardMaterial)
        parts.legMeshes.push(mesh)
        break
      case "Skin_Darker":
        mesh.material = source.clone()
        parts.skinShade.push(mesh.material as THREE.MeshStandardMaterial)
        break
      case "Hair":
        mesh.material = source.clone()
        parts.hair.push(mesh.material as THREE.MeshStandardMaterial)
        parts.hairMeshes.push(mesh)
        break
      case "Eyebrows":
        mesh.material = source.clone()
        parts.brows.push(mesh.material as THREE.MeshStandardMaterial)
        break
      case "Red_Dark":
        mesh.material = source.clone()
        parts.shoes.push(mesh.material as THREE.MeshStandardMaterial)
        break
    }
  })

  // Snap to the bind pose so accessory offsets can be measured in model space.
  ;(skeleton as THREE.Skeleton | null)?.pose()
  root.updateMatrixWorld(true)
  const bindInverse = new Map<string, THREE.Matrix4>()
  for (const [name, bone] of bones) bindInverse.set(name, bone.matrixWorld.clone().invert())
  // Each foot bone sits below the end of its shin (feet aren't children of the
  // legs); keep that gap when seating the model.
  const footOffset = new Map<string, THREE.Vector3>()
  for (const side of ["L", "R"]) {
    const foot = bones.get(`Foot${side}`)
    const end = bones.get(`LowerLeg${side}_end`)
    if (foot && end) {
      footOffset.set(side, foot.getWorldPosition(new THREE.Vector3()).sub(end.getWorldPosition(new THREE.Vector3())))
    }
  }

  // Where the shins end with the legs straight (feet planted), for dancing.
  let legEndY = Infinity
  for (const side of ["L", "R"]) {
    const end = bones.get(`LowerLeg${side}_end`)
    if (end) legEndY = Math.min(legEndY, end.getWorldPosition(new THREE.Vector3()).y)
  }

  // The pelvis turn and the body's height are set relative to the bind pose
  // (the clips may not animate them, so they'd otherwise add up frame to frame).
  const bodyBind = bones.get("Body")?.position.clone() ?? null
  const hipsBind = bones.get("Hips")?.quaternion.clone() ?? null

  const rig: PoseRig & { parts: Parts; bones: Map<string, THREE.Bone>; bindInverse: Map<string, THREE.Matrix4>; footOffset: Map<string, THREE.Vector3> } = {
    root,
    parts,
    bones,
    bindInverse,
    footOffset,
    legEndY,
    bodyBind,
    hipsBind,
    skeleton: SKELETON
  }
  rig.settle = () => attachFeet(rig)
  return rig
}

function setPattern(materials: THREE.MeshStandardMaterial[], mode: number, base: string, accent: string) {
  for (const material of materials) {
    const uniforms = material.userData.pattern as PatternUniforms
    uniforms.uMode.value = mode
    uniforms.uBase.value.set(base)
    uniforms.uAccent.value.set(accent)
  }
}

function setColor(materials: THREE.MeshStandardMaterial[], color: string | THREE.Color) {
  for (const material of materials) material.color.set(color)
}

/** Children are written in bind-pose model coordinates but ride along with `bone`. */
function OnBone({
  rig,
  bone,
  version,
  children
}: {
  rig: ReturnType<typeof instantiate>
  bone: string
  /** Changes whenever the parts change (they're merged into one mesh per material). */
  version: string
  children: ReactNode
}) {
  const target = rig.bones.get(bone)
  const inverse = rig.bindInverse.get(bone)
  if (!target || !inverse) return null
  return createPortal(
    <group matrix={inverse} matrixAutoUpdate={false}>
      <MergeStatic version={version}>{children}</MergeStatic>
    </group>,
    target
  )
}

export type AvatarPose = "auto" | "dance"

export type { RidePose } from "./avatarPose"

/** The old model's bones, for the hand-made poses (avatarPose). */
const SKELETON: Skeleton = {
  torso: "Torso",
  neck: "Neck",
  head: "Head",
  headTip: "Head_end",
  hips: "Hips",
  body: "Body",
  upperArm: (side) => `UpperArm${side}`,
  lowerArm: (side) => `LowerArm${side}`,
  wrist: (side) => `Wrist${side}`,
  upperLeg: (side) => `UpperLeg${side}`,
  lowerLeg: (side) => `LowerLeg${side}`,
  ankle: (side) => `LowerLeg${side}_end`
}

const feetScratch = { matrix: new THREE.Matrix4(), parentMatrix: new THREE.Matrix4(), point: new THREE.Vector3() }

/**
 * The feet are separate bones (not children of the shins): carry each along
 * with its shin's end, keeping the bind-pose gap so the shoe isn't stretched.
 * Clips that don't animate the feet (Idle, Wave, …) would otherwise leave them
 * where the T-pose put them, 12–19 cm from the ankles.
 * World matrices are left to the renderer, which refreshes them before drawing.
 */
function attachFeet(rig: ReturnType<typeof instantiate>) {
  const { root, bones } = rig
  for (const side of ["L", "R"] as const) {
    const foot = bones.get(`Foot${side}`)
    const end = bones.get(`LowerLeg${side}_end`)
    const offset = rig.footOffset.get(side)
    if (!foot || !end || !foot.parent || !offset) continue
    // The offset is in model (root) space: add it there, then express the
    // point in the foot's parent frame.
    feetScratch.point.setFromMatrixPosition(rootSpace(end, root, feetScratch.matrix)).add(offset)
    rootSpace(foot.parent, root, feetScratch.parentMatrix).invert()
    foot.position.copy(feetScratch.point.applyMatrix4(feetScratch.parentMatrix))
  }
}

function HumanAvatar({
  loadout,
  moving,
  pose,
  gait,
  act,
  ride,
  dance,
  posed,
  noBackpack
}: {
  loadout: AvatarLoadout
  moving: boolean
  pose: AvatarPose
  gait: "walk" | "run"
  act?: AvatarAct
  ride?: RidePose
  dance?: DanceState | null
  posed?: { current: DanceFrame | null }
  noBackpack?: boolean
}) {
  const { scene, animations } = useGLTF(MODEL_URL)
  const rig = useMemo(() => instantiate(scene), [scene])
  const { actions } = useAnimations(animations, rig.root)
  const resolved = resolveLoadout(loadout)
  const { outfit, hair, hairColor, hat, glasses, shoes, skin, shirt, pants } = resolved
  const numberTexture = useNumberTexture(outfit === "jersey")
  const spinRef = useRef<THREE.Group>(null)

  // Colours and outfit painting.
  useLayoutEffect(() => {
    const { parts } = rig
    const top =
      outfit === "kanzu" ? KANZU_COLOR : outfit === "cranes" ? CRANES_YELLOW : shirt
    const accent = outfit === "bodavest" ? BODA_VEST_COLOR : shirt
    setPattern(parts.top, TOP_MODE[outfit], top, accent)
    const sleeve = outfit === "kanzu" ? KANZU_COLOR : shirt
    const sleeveMode = outfit === "tracksuit" ? 2 : outfit === "hoodie" || outfit === "kanzu" ? 1 : 0
    setPattern(parts.arms, sleeveMode, skin, sleeve)
    setPattern(parts.legs, outfit === "tracksuit" ? 1 : 0, pants, pants)
    setColor(parts.skin, skin)
    setColor(parts.skinShade, new THREE.Color(skin).multiplyScalar(0.82))
    setColor(parts.hair, hairColor)
    setColor(parts.brows, hairColor)
    setColor(parts.shoes, shoes)
    // The model's own hair is the "short" style; full-coverage hats hide it.
    const ownHair = hair === "short" && hat !== "helmet" && hat !== "headwrap" && hat !== "beanie"
    for (const mesh of parts.hairMeshes) mesh.visible = ownHair
    // Robes hang from the hips; hiding the trousers stops striding legs
    // poking through the cloth (the shoes still show under the hem).
    const robed = outfit === "kanzu" || outfit === "gomesi"
    for (const mesh of parts.legMeshes) mesh.visible = !robed
  }, [rig, outfit, shirt, skin, pants, hairColor, shoes, hair, hat])

  // Animation state machine with short cross-fades.
  const clip = act
    ? ACT_CLIPS[act]
    : ride || dance
      ? CLIPS.idle
      : pose === "dance"
      ? CLIPS.dance
      : moving
        ? CLIPS[gait]
        : CLIPS.idle
  useEffect(() => {
    const action = actions[clip]
    if (!action) return
    if (act) {
      const once = ONE_SHOT_ACTS.has(act)
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
      action.clampWhenFinished = once
      action.reset().fadeIn(0.2).play()
      return () => {
        action.fadeOut(0.2)
      }
    }
    // Racing: mix some idle pose into the run so the stride stays compact on
    // the map instead of legs splaying across the road. (Fixed weights here —
    // a fadeIn would animate the weight back to 1.)
    const stance = clip === CLIPS.run ? actions[CLIPS.idle] : null
    if (stance) {
      action.reset().setEffectiveWeight(0.7).play()
      stance.reset().setEffectiveWeight(0.3).play()
    } else {
      action.reset().fadeIn(0.25).play()
    }
    return () => {
      action.fadeOut(0.25)
      stance?.fadeOut(0.25)
    }
  }, [actions, clip, act])

  // A little celebratory hop and turn on top of the wave.
  useFrame(({ clock }) => {
    const group = spinRef.current
    if (!group) return
    if ((dance && !act && !ride) || posed?.current) return
    if (pose === "dance" && !act) {
      const t = clock.elapsedTime
      group.position.y = Math.abs(Math.sin(t * 5)) * 0.08
      group.rotation.y = Math.sin(t * 1.4) * 0.6
    } else if (group.position.x !== 0 || group.position.y !== 0 || group.rotation.y !== 0) {
      group.position.set(0, 0, 0)
      group.rotation.y = 0
    }
  })

  // Seated: aim the limbs after the mixer has applied this frame's idle pose
  // (registered after useAnimations, so it runs after it).
  // Otherwise, keep the feet on the ankles for clips that don't move them.
  const clipMovesFeet = useMemo(
    () => animations.find((candidate) => candidate.name === clip)?.tracks.some((track) => track.name.startsWith("Foot")) ?? false,
    [animations, clip]
  )
  // Dancing: the routine's pose for this moment, also after the mixer.
  const dancedRef = useRef(false)
  useFrame(() => {
    const frame = posed?.current ?? (dance && !act && !ride ? danceFrame(dance.routine, beatsAt(dance, performance.now())) : null)
    if (frame) {
      applyDanceFrame(rig, frame)
      spinRef.current?.position.set(frame.shiftX, 0, 0)
      spinRef.current?.rotation.set(0, frame.yaw, 0)
      dancedRef.current = true
      return
    }
    if (dancedRef.current) {
      // Stopped dancing: hand the bones the dance moved back to the clips.
      resetDanceBones(rig)
      dancedRef.current = false
    }
    if (ride && !act) applyRidePose(rig, ride)
    else if (!clipMovesFeet) attachFeet(rig)
  })

  const robe = outfit === "kanzu" ? KANZU_COLOR : outfit === "gomesi" ? shirt : null
  // Everything the bone-mounted parts depend on.
  const partsKey = JSON.stringify([loadout, !!ride])

  return (
    <group ref={spinRef}>
      <primitive object={rig.root} />

      <OnBone rig={rig} version={partsKey} bone="Head">
        {hair !== "short" && hat !== "helmet" && (
          <group position={HEAD_CENTER} scale={HEAD_SCALE}>
            <Hair style={hair} color={hairColor} hat={hat} />
          </group>
        )}
        <group position={HAT_POSITION} scale={HAT_SCALE}>
          <RealisticHat style={hat} color={resolved.hatColor} />
        </group>
        <group position={[0, 1.672, 0.07]} scale={HEAD_SCALE}>
          <Glasses style={glasses} />
        </group>
      </OnBone>

      <OnBone rig={rig} version={partsKey} bone="Chest">
        {/* Seated on a boda, a backpack would push into whoever sits behind. */}
        {!ride && !noBackpack && <Backpack color={resolved.backpack} />}
        {outfit === "jersey" && numberTexture && <JerseyNumber texture={numberTexture} />}
        {outfit === "cranes" && <CranesBadge />}
      </OnBone>

      {outfit === "hoodie" && (
        <OnBone rig={rig} version={partsKey} bone="Neck">
          <Hood color={shirt} />
        </OnBone>
      )}

      {robe && (
        <OnBone rig={rig} version={partsKey} bone="Hips">
          <Robe outfit={outfit} color={robe} />
        </OnBone>
      )}

      {outfit === "gomesi" &&
        (["UpperArmL", "UpperArmR"] as const).map((bone, i) => (
          // Gomesi's signature puffed, peaked shoulders.
          <OnBone key={bone} rig={rig} version={partsKey} bone={bone}>
            <GomesiShoulder side={i === 0 ? 1 : -1} color={shirt} />
          </OnBone>
        ))}
    </group>
  )
}

export function RealisticAvatar({
  loadout,
  moving,
  pose = "auto",
  gait = "walk",
  act,
  ride,
  dance,
  posed,
  noBackpack,
  phase,
  timeScale,
  clip,
  crowd
}: {
  loadout: AvatarLoadout
  moving: boolean
  /** "dance" plays the victory celebration. */
  pose?: AvatarPose
  /** Which cycle plays while moving: strolling at home, running in races. */
  gait?: "walk" | "run"
  /** Scripted beat; overrides pose/moving (storytelling scenes only). */
  act?: AvatarAct
  /** Seated on a boda (rider or passenger); hips stay where the caller puts the model's origin. */
  ride?: RidePose
  /** A dance routine playing to a beat (overrides pose and moving). */
  dance?: DanceState | null
  /** Kept for callers; the rigged model is light enough to use everywhere. */
  detail?: "full" | "lite"
  /** An exact pose, read every frame (scripted scenes such as the intro video). */
  posed?: { current: DanceFrame | null }
  /** Leave the backpack off (scripted scenes: Mum at home). */
  noBackpack?: boolean
  /** Seconds into the walk, so crowd members do not step in unison. */
  phase?: number
  /** Animation speed, new bodies only (a strolling crowd walks slower). */
  timeScale?: number
  /** Any clip by name, new bodies only (the street crowd standing about or sitting). */
  clip?: string
  /** The lighter street-crowd body, new bodies only (see CrowdBody): no add-ons, hair short, afro or none. */
  crowd?: boolean
}) {
  // The new realistic bodies, when switched on.
  if (newBodiesOn()) {
    return (
      <Suspense fallback={null}>
        {crowd ? (
          <CrowdBody loadout={loadout} moving={moving} phase={phase} timeScale={timeScale} clip={clip} />
        ) : (
          <NewBody loadout={loadout} moving={moving} pose={pose} gait={gait} act={act} ride={ride} dance={dance} posed={posed} noBackpack={noBackpack} phase={phase} timeScale={timeScale} clip={clip} />
        )}
      </Suspense>
    )
  }
  return (
    <Suspense fallback={null}>
      <HumanAvatar loadout={loadout} moving={moving} pose={pose} gait={gait} act={act} ride={ride} dance={dance} posed={posed} noBackpack={noBackpack} />
    </Suspense>
  )
}
