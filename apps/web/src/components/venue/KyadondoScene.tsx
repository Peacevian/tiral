"use client"

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import { KYADONDO } from "@tiral/game-core"
import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"
import type { VenuePerson } from "@/lib/useColyseus"
import { isLiteDevice, sceneQuality } from "@/lib/deviceTier"
import { Crowd, OtherPerson, You, crowdSize } from "./VenuePeople"
import type { VenueControls } from "./VenuePeople"

// Kyadondo Rugby Grounds, Jinja Road (docs/kyadondo.md), laid out like the
// real ground from OpenStreetMap: the pitch along Jinja Road (x, 1 unit = 1 m),
// the clubhouse and stand on the north (Jinja Road, −z) side, and the pork
// joint, bar, stage and tents along the south edge. Lugogo Mall is across the
// road. Simple boxes and planes, so it runs on cheap phones.

type V3 = [number, number, number]

export type VenueTime = "day" | "evening"

function Box({ from, to, color, roughness = 0.85, metalness = 0, emissive }: { from: V3; to: V3; color: string; roughness?: number; metalness?: number; emissive?: string }) {
  const size: V3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const position: V3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2]
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} emissive={emissive ?? "#000000"} emissiveIntensity={emissive ? 1.2 : 0} />
    </mesh>
  )
}

/** A painted sign: text on a board facing +z (or rotated). */
function Sign({ text, at, width, height = 1.2, rotY = 0, bg = "#1E56A8", fg = "#FFFFFF" }: { text: string; at: V3; width: number; height?: number; rotY?: number; bg?: string; fg?: string }) {
  const texture = useMemo(() => {
    if (typeof document === "undefined") return null
    const canvas = document.createElement("canvas")
    canvas.width = 512
    canvas.height = Math.round((512 * height) / width)
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = fg
    ctx.font = `900 ${Math.round(canvas.height * 0.62)}px system-ui, sans-serif`
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2, canvas.width * 0.92)
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    return result
  }, [text, width, height, bg, fg])
  useEffect(() => () => texture?.dispose(), [texture])
  return (
    <mesh position={at} rotation={[0, rotY, 0]}>
      <planeGeometry args={[width, height]} />
      <meshStandardMaterial map={texture ?? undefined} color={texture ? "#ffffff" : bg} roughness={0.6} />
    </mesh>
  )
}

function Tree({ at, scale = 1 }: { at: [number, number]; scale?: number }) {
  return (
    <group position={[at[0], 0, at[1]]} scale={scale}>
      <mesh position={[0, 2, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.4, 4, 8]} />
        <meshStandardMaterial color="#6B4A2B" roughness={1} />
      </mesh>
      <mesh position={[0, 5.2, 0]} castShadow>
        <sphereGeometry args={[2.6, 10, 8]} />
        <meshStandardMaterial color="#3F7D32" roughness={1} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// The pitch

const PITCH_LENGTH = 100
const PITCH_WIDTH = 55
const IN_GOAL = 10

function Pitch() {
  const halfL = PITCH_LENGTH / 2
  const halfW = PITCH_WIDTH / 2
  const line = (from: [number, number], to: [number, number]) => (
    <Box key={`${from}${to}`} from={[from[0] - 0.08, 0.05, from[1] - 0.08]} to={[to[0] + 0.08, 0.09, to[1] + 0.08]} color="#FFFFFF" roughness={0.9} />
  )
  // Mown stripes across the pitch.
  const stripes = Array.from({ length: 12 }, (_, i) => -halfL - IN_GOAL + (i * (PITCH_LENGTH + 2 * IN_GOAL)) / 12)
  return (
    <group>
      {stripes.map((x, i) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x + (PITCH_LENGTH + 2 * IN_GOAL) / 24, 0.04, 0]} receiveShadow>
          <planeGeometry args={[(PITCH_LENGTH + 2 * IN_GOAL) / 12, PITCH_WIDTH]} />
          <meshStandardMaterial color={i % 2 === 0 ? "#5FA23F" : "#559638"} roughness={1} />
        </mesh>
      ))}
      {line([-halfL - IN_GOAL, -halfW], [halfL + IN_GOAL, -halfW])}
      {line([-halfL - IN_GOAL, halfW], [halfL + IN_GOAL, halfW])}
      {[-halfL - IN_GOAL, -halfL, -halfL + 22, 0, halfL - 22, halfL, halfL + IN_GOAL].map((x) => line([x, -halfW], [x, halfW]))}
      {/* H posts on each try line. */}
      {[-halfL, halfL].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {[-2.8, 2.8].map((z) => (
            <Box key={z} from={[-0.1, 0, z - 0.1]} to={[0.1, 11, z + 0.1]} color="#FFFFFF" />
          ))}
          <Box from={[-0.08, 3, -2.8]} to={[0.08, 3.16, 2.8]} color="#FFFFFF" />
          {[-2.8, 2.8].map((z) => (
            <Box key={`pad${z}`} from={[-0.3, 0, z - 0.3]} to={[0.3, 1.8, z + 0.3]} color="#1E56A8" />
          ))}
        </group>
      ))}
    </group>
  )
}

function Floodlight({ at, on }: { at: [number, number]; on: boolean }) {
  return (
    <group position={[at[0], 0, at[1]]}>
      <Box from={[-0.25, 0, -0.25]} to={[0.25, 22, 0.25]} color="#9CA3AF" metalness={0.5} roughness={0.5} />
      <Box from={[-2, 22, -0.4]} to={[2, 23.6, 0.4]} color="#4B5563" />
      <Box from={[-1.8, 22.15, at[1] > 0 ? -0.45 : 0.4]} to={[1.8, 23.45, at[1] > 0 ? -0.41 : 0.45]} color="#FFF7D6" emissive={on ? "#FFF3C4" : undefined} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// The clubhouse and stand (north, Jinja Road side)

function Clubhouse() {
  return (
    <group>
      <Box from={[-7, 0, -45]} to={[7, 7, -35]} color="#F1E7D3" />
      <Box from={[-7.6, 7, -45.6]} to={[7.6, 7.4, -34.4]} color="#7A2E1F" />
      {/* Upstairs balcony looking over the pitch. */}
      <Box from={[-7, 3.4, -35]} to={[7, 3.6, -33]} color="#E5E7EB" />
      <Box from={[-7, 3.6, -33.1]} to={[7, 4.6, -33]} color="#1E56A8" />
      {[-5, -1.5, 2, 5].map((x) => (
        <Box key={x} from={[x - 1, 4.4, -35.01]} to={[x + 1, 6.2, -34.99]} color="#33475B" roughness={0.3} />
      ))}
      <Box from={[-1.2, 0, -35.01]} to={[1.2, 2.6, -34.99]} color="#5B3A1E" />
      <Sign text="KYADONDO RUGBY CLUB" at={[0, 6.7, -32.98]} width={12} height={0.9} />
    </group>
  )
}

/** A covered stand: rows stepping up away from the pitch, a roof on posts. */
function Stand({ x0, x1 }: { x0: number; x1: number }) {
  const rows = [0, 1, 2, 3]
  return (
    <group>
      {rows.map((row) => (
        <Box key={row} from={[x0, 0, -31 - row * 0.9]} to={[x1, 0.5 + row * 0.5, -31.9 - row * 0.9]} color={row % 2 === 0 ? "#D1D5DB" : "#C4C9D0"} />
      ))}
      {[x0, (x0 + x1) / 2, x1].map((x) => (
        <Box key={x} from={[x - 0.12, 0, -34.8]} to={[x + 0.12, 4.4, -34.5]} color="#6B7280" />
      ))}
      <Box from={[x0 - 0.3, 4.4, -35.2]} to={[x1 + 0.3, 4.55, -30.4]} color="#1E56A8" metalness={0.3} roughness={0.5} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// The south row: pork joint, bar, stage, tents

/** A shed with an iron-sheet roof, open towards the pitch (−z). */
function Shed({ x0, x1, z0, z1, color }: { x0: number; x1: number; z0: number; z1: number; color: string }) {
  return (
    <group>
      <Box from={[x0, 0, z1 - 0.3]} to={[x1, 3.2, z1]} color={color} />
      <Box from={[x0, 0, z0]} to={[x0 + 0.3, 3.2, z1]} color={color} />
      <Box from={[x1 - 0.3, 0, z0]} to={[x1, 3.2, z1]} color={color} />
      <mesh position={[(x0 + x1) / 2, 3.5, (z0 + z1) / 2]} rotation={[-0.12, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[x1 - x0 + 0.8, 0.08, z1 - z0 + 1.2]} />
        <meshStandardMaterial color="#9AA5AD" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  )
}

function Smoke({ at }: { at: V3 }) {
  const puffs = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    puffs.current?.children.forEach((puff, i) => {
      const t = (clock.elapsedTime * 0.35 + i / 5) % 1
      puff.position.set(Math.sin(i * 2 + t * 3) * 0.4, t * 5, Math.cos(i) * 0.3)
      puff.scale.setScalar(0.4 + t * 1.4)
      ;((puff as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.45 * (1 - t)
    })
  })
  return (
    <group ref={puffs} position={at}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.6, 8, 6]} />
          <meshStandardMaterial color="#D6D3D1" transparent opacity={0.4} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function PorkJoint() {
  return (
    <group>
      <Shed x0={-28} x1={-12} z0={44} z1={55} color="#C9B48A" />
      {/* The grill: coals glowing, pork on it. */}
      <Box from={[-25, 0, 47]} to={[-15, 0.9, 49]} color="#2B2B2B" metalness={0.4} />
      <Box from={[-24.8, 0.9, 47.2]} to={[-15.2, 0.95, 48.8]} color="#FF6A1A" emissive="#FF5A0A" />
      {[-23.5, -21.5, -19.5, -17.5].map((x) => (
        <Box key={x} from={[x - 0.5, 0.95, 47.5]} to={[x + 0.5, 1.15, 48.5]} color="#9A4A23" />
      ))}
      <Smoke at={[-20, 1.2, 48]} />
      <Box from={[-27, 0, 52]} to={[-21, 1, 54]} color="#8A6A45" />
      <Sign text="PORK JOINT" at={[-20, 3.05, 43.98]} width={6} height={0.9} rotY={Math.PI} bg="#9A2B1F" />
    </group>
  )
}

function Bar() {
  return (
    <group>
      <Shed x0={-8} x1={10} z0={44} z1={55} color="#D8C7A0" />
      <Box from={[-6, 0, 46]} to={[8, 1.15, 47.2]} color="#6B3F1F" />
      <Box from={[-6.1, 1.15, 45.9]} to={[8.1, 1.25, 47.3]} color="#3F2A16" />
      {/* Fridges full of drinks at the back. */}
      {[-5, -2.5, 0].map((x) => (
        <group key={x}>
          <Box from={[x, 0, 53]} to={[x + 2, 2.2, 54.5]} color="#E5E7EB" />
          <Box from={[x + 0.15, 0.2, 52.98]} to={[x + 1.85, 2, 53]} color="#BFE3F5" roughness={0.2} emissive="#9BD4F0" />
        </group>
      ))}
      {[2.5, 4, 5.5].map((x, i) => (
        <Box key={x} from={[x, 0, 53]} to={[x + 1.2, 1.1, 54.2]} color={["#C8102E", "#F2C14E", "#1E56A8"][i]!} />
      ))}
      <Sign text="BAR" at={[1, 3.05, 43.98]} width={4} height={0.9} rotY={Math.PI} bg="#1E56A8" />
    </group>
  )
}

function Stage({ evening, time }: { evening: boolean; time: number }) {
  const colors = ["#E85F0C", "#C2185B", "#1E56A8", "#2F7D4A"]
  return (
    <group>
      <Box from={[16, 0, 46]} to={[36, 1.2, 58]} color="#1F2937" />
      <Box from={[16, 1.2, 57.5]} to={[36, 7, 58]} color="#111827" />
      {/* Truss with lights. */}
      {[16.2, 35.8].map((x) => (
        <Box key={x} from={[x - 0.15, 1.2, 46.3]} to={[x + 0.15, 7.5, 46.6]} color="#9CA3AF" metalness={0.6} />
      ))}
      <Box from={[16, 7.4, 46.3]} to={[36, 7.7, 46.6]} color="#9CA3AF" metalness={0.6} />
      {[18, 22, 26, 30, 34].map((x, i) => (
        <Box key={x} from={[x - 0.3, 7, 46.2]} to={[x + 0.3, 7.4, 46.6]} color="#111" emissive={evening ? colors[(i + Math.floor(time * 2)) % colors.length] : undefined} />
      ))}
      {/* Speaker stacks and the DJ table. */}
      {[15, 36].map((x) => (
        <Box key={x} from={[x - 1, 0, 45]} to={[x + 1, 3.2, 46.6]} color="#0B0B0B" />
      ))}
      <Box from={[23, 1.2, 50]} to={[29, 2.2, 51.2]} color="#0F172A" />
      <Sign text="KYADONDO NIGHTS" at={[26, 5.2, 57.48]} width={14} height={1.6} rotY={Math.PI} bg="#111827" fg="#F2C14E" />
    </group>
  )
}

/** A white tent with a plastic table and chairs under it. */
function Tent({ at }: { at: [number, number] }) {
  return (
    <group position={[at[0], 0, at[1]]}>
      {[-2.2, 2.2].map((x) => [-2.2, 2.2].map((z) => <Box key={`${x}${z}`} from={[x - 0.05, 0, z - 0.05]} to={[x + 0.05, 2.4, z + 0.05]} color="#E5E7EB" />))}
      <mesh position={[0, 3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[3.4, 1.4, 4, 1, true]} />
        <meshStandardMaterial color="#F8FAFC" side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow>
        <cylinderGeometry args={[0.7, 0.7, 0.06, 16]} />
        <meshStandardMaterial color="#F5F5F4" roughness={0.6} />
      </mesh>
      <Box from={[-0.05, 0, -0.05]} to={[0.05, 0.72, 0.05]} color="#E7E5E4" />
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2
        return (
          <group key={i} position={[Math.sin(a) * 1.2, 0, Math.cos(a) * 1.2]} rotation={[0, a, 0]}>
            <Box from={[-0.25, 0.42, -0.25]} to={[0.25, 0.48, 0.25]} color={i % 2 === 0 ? "#C8102E" : "#1E56A8"} />
            <Box from={[-0.25, 0.48, 0.2]} to={[0.25, 0.95, 0.26]} color={i % 2 === 0 ? "#C8102E" : "#1E56A8"} />
          </group>
        )
      })}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Outside: Jinja Road, the gate, bodas, Lugogo Mall

function Boda({ at, turn = 0 }: { at: [number, number]; turn?: number }) {
  return (
    <group position={[at[0], 0, at[1]]} rotation={[0, turn, 0]}>
      {[-0.6, 0.6].map((x) => (
        <mesh key={x} position={[x, 0.32, 0]} rotation={[0, 0, 0]}>
          <torusGeometry args={[0.3, 0.08, 6, 14]} />
          <meshStandardMaterial color="#111" roughness={0.8} />
        </mesh>
      ))}
      <Box from={[-0.7, 0.45, -0.1]} to={[0.6, 0.8, 0.1]} color="#B91C1C" roughness={0.4} />
      <Box from={[-0.5, 0.8, -0.15]} to={[0.2, 0.92, 0.15]} color="#111" />
    </group>
  )
}

function Outside() {
  return (
    <group>
      {/* Jinja Road. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, -75]} receiveShadow>
        <planeGeometry args={[320, 14]} />
        <meshStandardMaterial color="#4B5058" roughness={0.95} />
      </mesh>
      {Array.from({ length: 30 }, (_, i) => -150 + i * 10).map((x) => (
        <Box key={x} from={[x, 0.06, -75.1]} to={[x + 4, 0.1, -74.9]} color="#F5F5F4" />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, -67]} receiveShadow>
        <planeGeometry args={[320, 2.5]} />
        <meshStandardMaterial color="#9CA3AF" roughness={0.95} />
      </mesh>
      {/* Lugogo Mall across the road. */}
      <Box from={[-45, 0, -128]} to={[45, 14, -98]} color="#E8E2D6" />
      <Box from={[-45, 0, -98.1]} to={[45, 4, -97.9]} color="#33475B" roughness={0.3} />
      <Sign text="LUGOGO MALL" at={[0, 10.5, -97.88]} width={22} height={2.6} bg="#C8102E" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, -89]} receiveShadow>
        <planeGeometry args={[100, 16]} />
        <meshStandardMaterial color="#A8A29E" roughness={0.95} />
      </mesh>
      {/* The boda stage outside the gate. */}
      {[-70, -68.2, -66.4, -48, -46.2].map((x, i) => (
        <Boda key={x} at={[x, -69]} turn={i % 2 ? 0.2 : -0.15} />
      ))}
    </group>
  )
}

/** The fence round the ground, with the gate on Jinja Road. */
function Fence() {
  const gate: [number, number] = [-62, -52]
  const wall = "#D9D2C3"
  return (
    <group>
      <Box from={[-80, 0, -66]} to={[gate[0], 2.2, -65.6]} color={wall} />
      <Box from={[gate[1], 0, -66]} to={[80, 2.2, -65.6]} color={wall} />
      <Box from={[-80.4, 0, -66]} to={[-80, 2.2, 66]} color={wall} />
      <Box from={[80, 0, -66]} to={[80.4, 2.2, 66]} color={wall} />
      <Box from={[-80, 0, 65.6]} to={[80, 2.2, 66]} color={wall} />
      {/* The gate arch. */}
      {gate.map((x) => (
        <Box key={x} from={[x - 0.5, 0, -66.3]} to={[x + 0.5, 5, -65.3]} color="#1E56A8" />
      ))}
      <Box from={[gate[0] - 0.5, 5, -66.2]} to={[gate[1] + 0.5, 6.4, -65.4]} color="#1E56A8" />
      <Sign text="KYADONDO RUGBY CLUB" at={[(gate[0] + gate[1]) / 2, 5.7, -66.25]} width={10.5} height={1.1} rotY={Math.PI} />
      <Sign text="KYADONDO RUGBY CLUB" at={[(gate[0] + gate[1]) / 2, 5.7, -65.35]} width={10.5} height={1.1} />
    </group>
  )
}

// ---------------------------------------------------------------------------
// People

export const VENUE_START: [number, number] = [KYADONDO.arrival.x, KYADONDO.arrival.z]

/** The stage lights pulse on the beat. */
function BeatLight({ beat }: { beat: { bpm: number; startedAt: number } | null }) {
  const light = useRef<THREE.PointLight>(null)
  useFrame(() => {
    if (!light.current || !beat) return
    const beats = ((performance.now() - beat.startedAt) / 60_000) * beat.bpm
    const pulse = 0.5 + 0.5 * Math.cos(2 * Math.PI * beats)
    light.current.intensity = 25 + 45 * pulse
    light.current.color.setHSL((Math.floor(beats / 4) * 0.17) % 1, 0.9, 0.55)
  })
  return <pointLight ref={light} position={[26, 8, 42]} intensity={40} distance={34} decay={1.2} color="#E85F0C" />
}

export function KyadondoScene({
  loadout = DEFAULT_LOADOUT,
  time = "evening",
  camera = [-57, 16, -36],
  look,
  people = [],
  selfId = null,
  controls,
  correction = null,
  onMove,
  beat = null,
  hour = 20
}: {
  /** Everyone at the venue (from the room), and which one is you. */
  people?: VenuePerson[]
  selfId?: string | null
  /** The race controls (and keyboard); without them there's no "you" (the preview page). */
  controls?: MutableRefObject<VenueControls>
  correction?: { x: number; z: number; at: number } | null
  /** Tell the room where you are. */
  onMove?(x: number, z: number, heading: number, moving: boolean): void
  /** The music playing (dancers and lights follow it). */
  beat?: { bpm: number; startedAt: number } | null
  /** Kampala hour (how big the crowd is). */
  hour?: number
  loadout?: AvatarLoadout
  time?: VenueTime
  camera?: V3
  /** Where the camera looks at first (the gate, where you arrive, by default). */
  look?: V3
}) {
  const quality = sceneQuality()
  const evening = time === "evening"
  const lite = useMemo(() => isLiteDevice(), [])
  const self = people.find((person) => person.id === selfId) ?? null
  // Where the room placed you when you arrived (fixed after that: you move yourself).
  const [start, setStart] = useState<{ x: number; z: number } | null>(null)
  useEffect(() => {
    if (self && !start) setStart({ x: self.x, z: self.z })
  }, [self, start])
  const [clock, setClock] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setClock((t) => t + 0.5), 500)
    return () => clearInterval(id)
  }, [])
  const others = people.filter((person) => person.id !== selfId).slice(0, lite ? 10 : 24)
  const crowd = Math.max(2, crowdSize(hour, lite) - Math.floor(others.length / 2))
  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      camera={{ position: camera, fov: 50, near: 0.5, far: 700 }}
      gl={{ antialias: quality.antialias }}
      dpr={quality.dpr}
      shadows={quality.shadows}
    >
      <color attach="background" args={[evening ? "#3A3F6E" : "#BFD9F2"]} />
      <fog attach="fog" args={[evening ? "#3A3F6E" : "#BFD9F2", 160, 340]} />
      <hemisphereLight args={[evening ? "#B7BCE8" : "#FFF4D6", evening ? "#3B4A30" : "#7F9A6A", evening ? 1.1 : 0.9]} />
      <directionalLight position={evening ? [-60, 40, 30] : [40, 80, 30]} intensity={evening ? 1.1 : 2.4} color={evening ? "#FFC58A" : "#FFF1D6"} castShadow shadow-mapSize={[2048, 2048]}>
        <orthographicCamera attach="shadow-camera" args={[-90, 90, 90, -90, 1, 260]} />
      </directionalLight>
      {evening && (
        <>
          {/* The floodlights, the stage (on the beat), the grill and the bar. */}
          {[
            [-56, -32],
            [56, -32],
            [-56, 32],
            [56, 32]
          ].map(([x, z]) => (
            <pointLight key={`${x}${z}`} position={[x!, 22, z!]} intensity={60} distance={110} decay={1.2} color="#FFF3C4" />
          ))}
          <BeatLight beat={beat} />
          <pointLight position={[-20, 4, 46]} intensity={15} distance={14} decay={1.2} color="#FF7A2E" />
          <pointLight position={[1, 4, 47]} intensity={15} distance={16} decay={1.2} color="#BFE3F5" />
        </>
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color={evening ? "#3E6B2E" : "#6FA64B"} roughness={1} />
      </mesh>
      <Pitch />
      {[
        [-56, -32],
        [56, -32],
        [-56, 32],
        [56, 32]
      ].map(([x, z]) => (
        <Floodlight key={`${x}${z}`} at={[x!, z!]} on={evening} />
      ))}
      <Clubhouse />
      <Stand x0={-35} x1={-9} />
      <Stand x0={9} x1={35} />
      <PorkJoint />
      <Bar />
      <Stage evening={evening} time={clock} />
      {[-30, -18, -6, 6].map((x) => (
        <Tent key={x} at={[x, 36]} />
      ))}
      <Box from={[-45, 0, 52]} to={[-35, 2.8, 60]} color="#B9A98A" />
      <Sign text="TOILETS" at={[-40, 2.2, 51.98]} width={3.4} height={0.6} rotY={Math.PI} bg="#374151" />
      <Box from={[40, 0, 50]} to={[54, 3, 60]} color="#CFC3A8" />
      <Sign text="CHANGING ROOMS" at={[47, 2.4, 49.98]} width={7} height={0.7} rotY={Math.PI} bg="#374151" />
      <Fence />
      <Outside />
      {[
        [-74, -50],
        [-74, -20],
        [-74, 10],
        [-74, 40],
        [74, -50],
        [74, -18],
        [74, 14],
        [74, 44],
        [-60, 60],
        [60, 60],
        [-40, -58],
        [40, -58]
      ].map(([x, z]) => (
        <Tree key={`${x}${z}`} at={[x!, z!]} scale={1.1} />
      ))}

      <Crowd count={crowd} evening={evening} beat={beat} />
      {others.map((person) => (
        <OtherPerson key={person.id} person={person} />
      ))}
      {controls && start && onMove ? (
        <You loadout={self?.loadout ?? loadout} controls={controls} start={start} correction={correction} onMove={onMove} />
      ) : (
        // The preview page: look around freely.
        <OrbitControls makeDefault enablePan={false} minDistance={4} maxDistance={260} maxPolarAngle={Math.PI / 2 - 0.08} target={look ?? [VENUE_START[0], 1.2, VENUE_START[1]]} />
      )}
    </Canvas>
  )
}
