"use client"

import { Suspense, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { lngLatToMercator } from "@tiral/map"
import type { AvatarLoadout } from "@tiral/avatars"
import { useMapOrigin } from "@/components/ThreeLayer"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import { NewBody } from "@/components/NewBody"
import { HERO } from "./hero"

// The code-made characters (scripts/characters) on the 3D map, next to the
// current avatar, to compare before swapping them into the game. Development
// only (/dev/hero).

/** The new man and woman as the trailer's hero (she in his colours, in amber). */
export const NEW_CAST: AvatarLoadout[] = [
  { ...HERO, body: "male" },
  { ...HERO, body: "female", shirt: "#f59e0b" }
]

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

/** `facing`: the compass bearing (degrees) they face while standing in a row. `cast`: the new pair's loadouts. */
export function NewCast({
  anchor,
  facing,
  clip,
  roam,
  cast = NEW_CAST
}: {
  anchor: { lat: number; lng: number }
  facing: number
  clip: CastClip
  roam: boolean
  cast?: AvatarLoadout[]
}) {
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
      <Mover index={0} count={cast.length + 1} facing={facing} roam={roam} gait={gait}>
        <RealisticAvatar loadout={HERO} moving={roam || gait in SPEED} gait={gait === "walking" ? "walk" : "run"} />
      </Mover>
      {cast.map((loadout, i) => (
        <Mover key={i} index={i + 1} count={cast.length + 1} facing={facing} roam={roam} gait={gait}>
          <Suspense fallback={null}>
            <NewBody loadout={loadout} moving={false} clip={gait} />
          </Suspense>
        </Mover>
      ))}
    </group>
  )
}

/** Places one person: in a row, or following the others round the loop. */
function Mover({
  index,
  count,
  facing,
  roam,
  gait,
  children
}: {
  index: number
  count: number
  facing: number
  roam: boolean
  gait: CastClip
  children: React.ReactNode
}) {
  const ref = useRef<THREE.Group>(null)
  const angle = useRef(0)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    // Stood up below, a model at rotation.z = θ faces compass bearing θ.
    const heading = (facing * Math.PI) / 180
    if (!roam) {
      // In a row across their line of sight, centred on the anchor.
      const along = ((count - 1) / 2 - index) * SPACING
      g.position.set(along * Math.cos(heading), along * Math.sin(heading), 0)
      g.rotation.z = heading
      return
    }
    angle.current += ((SPEED[gait as keyof typeof SPEED] ?? SPEED.walking) / LOOP_RADIUS) * Math.min(dt, 0.1)
    // A few metres apart along the loop.
    const a = angle.current - index * (2.2 / LOOP_RADIUS)
    g.position.set(Math.cos(a) * LOOP_RADIUS, Math.sin(a) * LOOP_RADIUS, 0)
    // Heading along the circle.
    g.rotation.z = a + Math.PI
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
