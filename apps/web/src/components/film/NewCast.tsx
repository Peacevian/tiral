"use client"

import { Suspense, useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { useAnimations, useGLTF } from "@react-three/drei"
import * as THREE from "three"
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js"
import { lngLatToMercator } from "@tiral/map"
import { useMapOrigin } from "@/components/ThreeLayer"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import type { Body } from "@tiral/avatars"
import { BODY_MODELS } from "@/components/NewBody"
import { HERO } from "./hero"

// The code-made characters (scripts/characters) on the 3D map, next to the
// current avatar, to compare before swapping them into the game. Development
// only (/dev/hero).

export const NEW_CAST = [
  { id: "hero", body: "male" },
  { id: "heroine", body: "female" }
] as const

/** The Mixamo clips in the files (scripts/characters/anims, named in lower case). */
export const CAST_CLIPS = [
  "breathing_idle",
  "walking",
  "running",
  "fast_run",
  "jump",
  "waving",
  "talking",
  "texting_while_standing",
  "sitting_idle",
  "sitting_talking",
  "sad_idle",
  "defeated",
  "victory",
  "hip_hop_dancing",
  "hit_reaction"
] as const
export type CastClip = (typeof CAST_CLIPS)[number]

const EARTH = 2 * Math.PI * 6378137
/** Metres between the three people standing in a row. */
const SPACING = 1.6
/** Size of the loop they walk in "walk around" mode, and their speeds (m/s). */
const LOOP_RADIUS = 7
const SPEED = { walking: 1.4, running: 3.6, fast_run: 5.5 } as const

/** `facing`: the compass bearing (degrees) they face while standing in a row. */
export function NewCast({ anchor, facing, clip, roam }: { anchor: { lat: number; lng: number }; facing: number; clip: CastClip; roam: boolean }) {
  const origin = useMapOrigin()
  const group = useRef<THREE.Group>(null)
  const mercator = useMemo(() => lngLatToMercator(anchor), [anchor])
  const scale = 1 / (EARTH * Math.cos((anchor.lat * Math.PI) / 180))
  useFrame(() => {
    const g = group.current
    if (!g) return
    g.position.set(mercator.x - origin.current.x, mercator.y - origin.current.y, 0)
    g.scale.setScalar(scale)
  })
  // Roaming: walk (or run) round a circle; a standing clip walks.
  const gait: CastClip = roam ? (clip in SPEED ? clip : "walking") : clip
  return (
    <group ref={group}>
      <hemisphereLight args={["#FFF1DC", "#6B5A48", 1.5]} position={[0, 0, 1]} />
      <directionalLight position={[-40, -60, 80]} intensity={2.4} color="#FFE2B8" />
      {/* The current avatar, then the new man and the new woman. */}
      <Mover index={0} facing={facing} roam={roam} gait={gait}>
        <RealisticAvatar loadout={HERO} moving={roam || gait in SPEED} gait={gait === "walking" ? "walk" : "run"} />
      </Mover>
      {NEW_CAST.map((person, i) => (
        <Mover key={person.id} index={i + 1} facing={facing} roam={roam} gait={gait}>
          <Suspense fallback={null}>
            <Person body={person.body} clip={gait} />
          </Suspense>
        </Mover>
      ))}
    </group>
  )
}

/** Places one person: in a row, or following the others round the loop. */
function Mover({ index, facing, roam, gait, children }: { index: number; facing: number; roam: boolean; gait: CastClip; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const angle = useRef(0)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    // Stood up below, a model at rotation.z = θ faces compass bearing θ - 180°.
    const heading = (facing * Math.PI) / 180 + Math.PI
    if (!roam) {
      // In a row across their line of sight.
      g.position.set((index - 1) * SPACING * Math.cos(heading), (index - 1) * SPACING * Math.sin(heading), 0)
      g.rotation.z = heading
      return
    }
    angle.current += ((SPEED[gait as keyof typeof SPEED] ?? SPEED.walking) / LOOP_RADIUS) * Math.min(dt, 0.1)
    // A few metres apart along the loop.
    const a = angle.current - index * (2.2 / LOOP_RADIUS)
    g.position.set(Math.cos(a) * LOOP_RADIUS, Math.sin(a) * LOOP_RADIUS, 0)
    // Heading along the circle.
    g.rotation.z = a
  })
  return (
    <group ref={ref}>
      {/* The map's y runs south: stand the model up and mirror it (as FilmActors). */}
      <group rotation={[Math.PI / 2, 0, 0]} scale={[-1, 1, 1]}>
        {children}
      </group>
    </group>
  )
}

/** A new body playing any of its clips (NewBody itself plays only the game's). */
function Person({ body, clip }: { body: Body; clip: CastClip }) {
  const { scene, animations } = useGLTF(BODY_MODELS[body])
  const model = useMemo(() => {
    const copy = clone(scene)
    copy.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) object.frustumCulled = false
    })
    return copy
  }, [scene])
  const { actions } = useAnimations(animations, model)
  useEffect(() => {
    const action = actions[clip]
    if (!action) return
    action.reset().fadeIn(0.25).play()
    return () => {
      action.fadeOut(0.25)
    }
  }, [actions, clip])
  return <primitive object={model} />
}
