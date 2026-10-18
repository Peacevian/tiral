"use client"

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import { Billboard } from "@react-three/drei"
import * as THREE from "three"
import { JOG_SPEED, WALK_SPEED, standable, walkStep } from "@tiral/game-core"
import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import type { DanceMoveId, DanceState } from "@/lib/dance/moves"
import type { VenuePerson } from "@/lib/useColyseus"

// The people at Kyadondo: you (moved by the joystick, kept out of anything
// solid, the camera following), the other players (smoothed between the
// room's updates), and the simulated crowd, which grows in the evening:
// dancers by the stage, people at the tables, queues at the counters, a cook,
// the DJ, and people wandering between them.

/** Text over someone's head, always facing the camera. */
export function Tag({ text, y = 2.35, bg = "#0F172A", fg = "#FFFFFF" }: { text: string; y?: number; bg?: string; fg?: string }) {
  const width = Math.min(3.2, 0.35 + text.length * 0.15)
  const texture = useMemo(() => {
    if (typeof document === "undefined") return null
    const canvas = document.createElement("canvas")
    canvas.width = 256
    canvas.height = Math.max(16, Math.round((256 * 0.34) / width))
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = fg
    ctx.font = `800 ${Math.round(canvas.height * 0.62)}px system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1, canvas.width * 0.92)
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    return result
  }, [text, width, bg, fg])
  useEffect(() => () => texture?.dispose(), [texture])
  return (
    <Billboard position={[0, y, 0]}>
      <mesh>
        <planeGeometry args={[width, 0.34]} />
        <meshBasicMaterial map={texture ?? undefined} color={texture ? "#ffffff" : bg} transparent />
      </mesh>
    </Billboard>
  )
}

const SEND_EVERY_MS = 120

/**
 * The race controls at a venue (ControlBar): Run toggles walking forward,
 * ← and → turn, ↓ turns around, Sprint (held) jogs. `turn` collects taps
 * (radians to add) until the next frame takes them.
 */
export type VenueControls = { running: boolean; sprint: boolean; turn: number }

/** How far one tap of ← or → turns you. */
export const TURN_STEP = Math.PI / 4
const CAMERA_BACK = 8
const CAMERA_UP = 4.2

/**
 * You. Each frame: turn towards the heading the taps asked for, walk (or jog)
 * forward while running, sliding along anything solid, and the camera follows
 * behind so forward is always up the screen. Your position goes to the room a
 * few times a second while you walk.
 */
export function You({
  loadout,
  controls,
  start,
  correction,
  onMove
}: {
  loadout: AvatarLoadout
  controls: MutableRefObject<VenueControls>
  start: { x: number; z: number }
  /** The room put you back somewhere (walked too fast or into a wall). */
  correction: { x: number; z: number; at: number } | null
  onMove(x: number, z: number, heading: number, moving: boolean): void
}) {
  const group = useRef<THREE.Group>(null)
  const at = useRef({ x: start.x, z: start.z })
  // Arrive facing into the grounds (+z, away from Jinja Road).
  const heading = useRef(0)
  const wanted = useRef(0)
  const [gait, setGait] = useState<"still" | "walk" | "run">("still")
  const gaitRef = useRef(gait)
  const sentAt = useRef(0)
  const wasMoving = useRef(false)
  const camera = useThree((state) => state.camera)
  const look = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (!correction) return
    at.current = { x: correction.x, z: correction.z }
  }, [correction])

  useFrame((_, delta) => {
    const dt = Math.min(0.1, delta)
    const input = controls.current
    if (input.turn !== 0) {
      wanted.current += input.turn
      input.turn = 0
    }
    // Ease round to the new heading.
    const turnLeft = wanted.current - heading.current
    heading.current += turnLeft * (1 - Math.exp(-10 * dt))
    let moving = false
    if (input.running) {
      const speed = input.sprint ? JOG_SPEED : WALK_SPEED
      const fx = Math.sin(heading.current)
      const fz = Math.cos(heading.current)
      const next = walkStep(at.current, { x: at.current.x + fx * speed * dt, z: at.current.z + fz * speed * dt })
      moving = Math.hypot(next.x - at.current.x, next.z - at.current.z) > 0.0005
      at.current = next
    }
    const nextGait = input.running ? (input.sprint ? "run" : "walk") : "still"
    if (gaitRef.current !== nextGait) {
      gaitRef.current = nextGait
      setGait(nextGait)
    }
    group.current?.position.set(at.current.x, 0, at.current.z)
    group.current?.rotation.set(0, heading.current, 0)
    // The camera behind you, a little above, catching up smoothly.
    const k = 1 - Math.exp(-6 * dt)
    camera.position.x += (at.current.x - Math.sin(heading.current) * CAMERA_BACK - camera.position.x) * k
    camera.position.z += (at.current.z - Math.cos(heading.current) * CAMERA_BACK - camera.position.z) * k
    camera.position.y += (CAMERA_UP - camera.position.y) * k
    camera.lookAt(look.set(at.current.x + Math.sin(heading.current) * 3, 1.3, at.current.z + Math.cos(heading.current) * 3))
    const now = performance.now()
    if ((moving && now - sentAt.current > SEND_EVERY_MS) || (!moving && wasMoving.current)) {
      sentAt.current = now
      onMove(at.current.x, at.current.z, heading.current, moving)
    }
    wasMoving.current = moving
  })
  return (
    <group ref={group} position={[start.x, 0, start.z]}>
      <RealisticAvatar loadout={loadout} moving={gait !== "still"} gait={gait === "run" ? "run" : "walk"} />
    </group>
  )
}

/** Another player: glides to where the room last saw them. */
export function OtherPerson({ person }: { person: VenuePerson }) {
  const group = useRef<THREE.Group>(null)
  const at = useRef({ x: person.x, z: person.z, h: person.h })
  useFrame((_, delta) => {
    const k = 1 - Math.exp(-8 * delta)
    const far = Math.hypot(person.x - at.current.x, person.z - at.current.z) > 8
    at.current.x = far ? person.x : at.current.x + (person.x - at.current.x) * k
    at.current.z = far ? person.z : at.current.z + (person.z - at.current.z) * k
    const turn = Math.atan2(Math.sin(person.h - at.current.h), Math.cos(person.h - at.current.h))
    at.current.h += turn * k
    group.current?.position.set(at.current.x, 0, at.current.z)
    group.current?.rotation.set(0, at.current.h, 0)
  })
  return (
    <group ref={group} position={[person.x, 0, person.z]}>
      <RealisticAvatar loadout={person.loadout} moving={person.m} />
      <Tag text={person.name} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// The simulated crowd

const LOOKS: Array<Partial<AvatarLoadout>> = [
  { shirt: "#C8102E", outfit: "jersey" },
  { shirt: "#1E56A8" },
  { shirt: "#F2C14E", outfit: "cranes" },
  { shirt: "#2F7D4A", outfit: "hoodie" },
  { shirt: "#7C3AED" },
  { shirt: "#F5F5F4", outfit: "kanzu" },
  { shirt: "#E85F0C" },
  { shirt: "#0F172A", outfit: "tracksuit" },
  { shirt: "#EC4899", outfit: "gomesi" },
  { shirt: "#14B8A6" },
  { shirt: "#F59E0B", outfit: "hoodie" },
  { shirt: "#64748B" }
]

const ROUTINES: DanceMoveId[][] = [
  ["groove", "step", "sway", "kadodi"],
  ["handsUp", "clap", "shaku", "gwara"],
  ["sway", "twist", "point", "groove"],
  ["runningMan", "floss", "dab", "groove"],
  ["azonto", "step", "raiseRoof", "shimmy"],
  ["drop", "groove", "kick", "wave"]
]

type Spot = { x: number; z: number; face: number }
type Role =
  | { kind: "dance"; spot: Spot; routine: number }
  | { kind: "sit"; spot: Spot }
  | { kind: "stand"; spot: Spot }
  | { kind: "wander"; route: Spot[] }
  | { kind: "dj" }
  | { kind: "cook" }

/** Seats round the tent tables: facing the table. */
const SEATS: Spot[] = [-30, -18, -6, 6].flatMap((x) =>
  [0, 1, 2, 3].map((i) => {
    const a = (i * Math.PI) / 2
    return { x: x + Math.sin(a) * 1.2, z: 36 + Math.cos(a) * 1.2, face: a + Math.PI }
  })
)
const DANCE_FLOOR: Spot[] = Array.from({ length: 14 }, (_, i) => ({ x: 17 + (i % 7) * 3, z: 38.5 + Math.floor(i / 7) * 3.2, face: 0 }))
const QUEUES: Spot[] = [
  { x: -4, z: 44.6, face: 0 },
  { x: 2, z: 44.4, face: 0.2 },
  { x: 5, z: 44.2, face: -0.2 },
  { x: -22, z: 45.4, face: 0 },
  { x: -18, z: 45.2, face: 0.3 }
]
/** Open ground people wander across (clear of anything solid). */
const ROUTES: Spot[][] = [
  [
    { x: -20, z: 42, face: 0 },
    { x: 0, z: 41, face: 0 },
    { x: 18, z: 34, face: 0 },
    { x: 0, z: 30, face: 0 }
  ],
  [
    { x: -50, z: -55, face: 0 },
    { x: -40, z: -20, face: 0 },
    { x: -24, z: 30, face: 0 },
    { x: -12, z: 41, face: 0 }
  ],
  [
    { x: 30, z: -28, face: 0 },
    { x: 40, z: 0, face: 0 },
    { x: 38, z: 40, face: 0 },
    { x: 10, z: 41, face: 0 }
  ]
]

/** How many simulated people, by the hour in Kampala: quiet mornings, full nights. */
export function crowdSize(hour: number, lite: boolean): number {
  const base = hour >= 18 || hour < 2 ? 24 : hour >= 14 ? 14 : hour >= 2 && hour < 7 ? 5 : 9
  return lite ? Math.ceil(base * 0.55) : base
}

function roles(count: number, evening: boolean): Role[] {
  const list: Role[] = [{ kind: "dj" }, { kind: "cook" }]
  const dancers = evening ? Math.round(count * 0.45) : Math.round(count * 0.2)
  const sitters = Math.round(count * 0.3)
  for (let i = 0; i < dancers && i < DANCE_FLOOR.length; i++) list.push({ kind: "dance", spot: DANCE_FLOOR[(i * 5) % DANCE_FLOOR.length]!, routine: i % ROUTINES.length })
  for (let i = 0; i < sitters && i < SEATS.length; i++) list.push({ kind: "sit", spot: SEATS[(i * 7) % SEATS.length]! })
  for (let i = 0; i < 3 && list.length < count; i++) list.push({ kind: "stand", spot: QUEUES[i % QUEUES.length]! })
  for (let i = 0; list.length < count; i++) list.push({ kind: "wander", route: ROUTES[i % ROUTES.length]! })
  return list.slice(0, Math.max(2, count))
}

/** Someone walking a loop between points, stopping a moment at each. */
function Wanderer({ route, loadout, offset }: { route: Spot[]; loadout: AvatarLoadout; offset: number }) {
  const group = useRef<THREE.Group>(null)
  const state = useRef({ leg: offset % route.length, x: route[offset % route.length]!.x, z: route[offset % route.length]!.z, pauseUntil: 0 })
  const [moving, setMoving] = useState(true)
  const movingRef = useRef(true)
  useFrame(({ clock }, delta) => {
    const s = state.current
    const now = clock.elapsedTime
    let walking = false
    if (now >= s.pauseUntil) {
      const goal = route[(s.leg + 1) % route.length]!
      const dx = goal.x - s.x
      const dz = goal.z - s.z
      const gap = Math.hypot(dx, dz)
      if (gap < 0.2) {
        s.leg = (s.leg + 1) % route.length
        s.pauseUntil = now + 2 + ((offset * 7) % 5)
      } else {
        const step = Math.min(gap, WALK_SPEED * 0.75 * Math.min(0.1, delta))
        const next = walkStep(s, { x: s.x + (dx / gap) * step, z: s.z + (dz / gap) * step })
        // Stuck on something: hop to the next point rather than freeze.
        if (next.x === s.x && next.z === s.z) s.leg = (s.leg + 1) % route.length
        s.x = next.x
        s.z = next.z
        group.current?.rotation.set(0, Math.atan2(dx, dz), 0)
        walking = true
      }
    }
    if (walking !== movingRef.current) {
      movingRef.current = walking
      setMoving(walking)
    }
    group.current?.position.set(s.x, 0, s.z)
  })
  return (
    <group ref={group}>
      <RealisticAvatar loadout={loadout} moving={moving} />
    </group>
  )
}

export function Crowd({ count, evening, beat }: { count: number; evening: boolean; beat: { bpm: number; startedAt: number } | null }) {
  const list = useMemo(() => roles(count, evening), [count, evening])
  // Before the music starts (or on the preview page): a steady 108.
  const fallback = useMemo(() => ({ bpm: 108, startedAt: typeof performance === "undefined" ? 0 : performance.now() }), [])
  const timing = beat ?? fallback
  const dance = (routine: DanceMoveId[]): DanceState => ({ routine, bpm: timing.bpm, startedAt: timing.startedAt })
  return (
    <group>
      {list.map((role, i) => {
        const loadout = { ...DEFAULT_LOADOUT, ...LOOKS[i % LOOKS.length] }
        switch (role.kind) {
          case "dj":
            return (
              <group key={i} position={[26, 1.2, 51.6]} rotation={[0, Math.PI, 0]}>
                <RealisticAvatar loadout={{ ...DEFAULT_LOADOUT, shirt: "#111827", hat: "cap" } as AvatarLoadout} moving={false} dance={dance(["groove", "point", "groove", "raiseRoof"])} />
                <Tag text="DJ" y={2.2} bg="#E85F0C" />
              </group>
            )
          case "cook":
            return (
              <group key={i} position={[-20, 0, 50.2]} rotation={[0, Math.PI, 0]}>
                <RealisticAvatar loadout={{ ...DEFAULT_LOADOUT, shirt: "#F5F5F4", outfit: "kanzu" } as AvatarLoadout} moving={false} act="phone" />
              </group>
            )
          case "dance":
            return (
              <group key={i} position={[role.spot.x, 0, role.spot.z]} rotation={[0, Math.PI, 0]}>
                <RealisticAvatar loadout={loadout} moving={false} dance={dance(ROUTINES[role.routine]!)} />
              </group>
            )
          case "sit":
            return (
              // Seated: the hips at chair height.
              <group key={i} position={[role.spot.x, -0.5, role.spot.z]} rotation={[0, role.spot.face, 0]}>
                <RealisticAvatar loadout={loadout} moving={false} ride="passenger" />
              </group>
            )
          case "stand":
            return (
              <group key={i} position={[role.spot.x, 0, role.spot.z]} rotation={[0, role.spot.face, 0]}>
                <RealisticAvatar loadout={loadout} moving={false} />
              </group>
            )
          case "wander":
            return <Wanderer key={i} route={role.route} loadout={loadout} offset={i} />
        }
      })}
    </group>
  )
}

/** Sanity check used by the bench: every fixed crowd spot is standable. */
export function crowdSpotsClear(): boolean {
  return [...DANCE_FLOOR, ...QUEUES, ...ROUTES.flat()].every((spot) => standable(spot))
}
