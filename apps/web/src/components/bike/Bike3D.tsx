"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import {
  MUDFLAP_SLOGANS,
  bikePaintColor,
  findBikeModel,
  findSeatCover,
  type BikeLook
} from "@tiral/game-core"

// A low-poly Kampala boda built from primitives, in metres, facing +Z with the
// ground at y = 0 (same frame as the rider). Every decoratable part is its own
// mesh so paint, seat covers, slogans and extras just swap materials.

export const WHEELBASE = 1.24
/** Where the rider's hips sit (model space). */
export const RIDER_SEAT = new THREE.Vector3(0, 0.84, -0.08)
/** Where a passenger's hips sit. */
export const PASSENGER_SEAT = new THREE.Vector3(0, 0.9, -0.48)
/** Handlebar grips, for the rider's hands. */
export const GRIP_Y = 1.02
export const GRIP_Z = 0.36
export const GRIP_HALF_WIDTH = 0.34

const METAL = { color: "#9ca3af", metalness: 0.8, roughness: 0.3 }
const CHROME = { color: "#e5e7eb", metalness: 1, roughness: 0.15 }
const RUBBER = { color: "#111111", metalness: 0, roughness: 0.9 }
const ENGINE = { color: "#374151", metalness: 0.6, roughness: 0.45 }

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  draw(ctx)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function seatTexture(pattern: string, color: string) {
  return canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 128, 128)
    if (pattern === "leopard") {
      for (let i = 0; i < 40; i++) {
        const x = (i * 37) % 128
        const y = (i * 53) % 128
        ctx.fillStyle = "#1c1917"
        ctx.beginPath()
        ctx.ellipse(x, y, 7, 5, i, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#92400e"
        ctx.beginPath()
        ctx.ellipse(x, y, 3.5, 2.5, i, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (pattern === "tartan") {
      ctx.globalAlpha = 0.45
      for (let i = 0; i < 128; i += 32) {
        ctx.fillStyle = "#14532d"
        ctx.fillRect(i, 0, 14, 128)
        ctx.fillRect(0, i, 128, 14)
        ctx.fillStyle = "#facc15"
        ctx.fillRect(i + 20, 0, 2, 128)
        ctx.fillRect(0, i + 20, 128, 2)
      }
      ctx.globalAlpha = 1
    } else if (pattern === "stripes") {
      ctx.fillStyle = "#ffffff"
      for (let i = 0; i < 128; i += 32) ctx.fillRect(i, 0, 12, 128)
    } else if (pattern === "fluffy") {
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.08)"
        ctx.fillRect((i * 29) % 128, (i * 71) % 128, 3, 3)
      }
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.08)"
      for (let y = 8; y < 128; y += 16) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(128, y)
        ctx.stroke()
      }
    }
  })
}

function sloganTexture(slogan: string | null) {
  return canvasTexture(256, 160, (ctx) => {
    ctx.fillStyle = "#111827"
    ctx.fillRect(0, 0, 256, 160)
    ctx.strokeStyle = "#e5e7eb"
    ctx.lineWidth = 6
    ctx.strokeRect(6, 6, 244, 148)
    if (!slogan) return
    ctx.fillStyle = "#facc15"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    const words = slogan.split(" ")
    const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(" "), words.slice(Math.ceil(words.length / 2)).join(" ")] : [slogan]
    const size = lines.some((line) => line.length > 10) ? 34 : 44
    ctx.font = `900 ${size}px system-ui, sans-serif`
    lines.forEach((line, index) => {
      ctx.fillText(line.toUpperCase(), 128, 80 + (index - (lines.length - 1) / 2) * (size + 6))
    })
  })
}

function plateTexture(text: string) {
  return canvasTexture(192, 64, (ctx) => {
    ctx.fillStyle = "#facc15"
    ctx.fillRect(0, 0, 192, 64)
    ctx.strokeStyle = "#111827"
    ctx.lineWidth = 5
    ctx.strokeRect(3, 3, 186, 58)
    ctx.fillStyle = "#111827"
    ctx.font = "900 34px system-ui, sans-serif"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillText(text, 96, 34)
  })
}

/** Stable plate like "UFA 214K" from any seed string. */
function plateFor(seed: string) {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const letters = "ABCDEFGHJKLMNPRSTUVWXYZ"
  const pick = (n: number) => letters[(hash >>> n) % letters.length]
  return `U${pick(3)}${pick(7)} ${100 + (hash % 900)}${pick(11)}`
}

function Wheel({ z, radius, spinRef }: { z: number; radius: number; spinRef: (node: THREE.Group | null) => void }) {
  const spokes = useMemo(() => Array.from({ length: 6 }, (_, i) => (i * Math.PI) / 6), [])
  return (
    <group position={[0, radius, z]}>
      <group ref={spinRef}>
        {/* Tyre and rim in the YZ plane. */}
        <mesh rotation={[0, Math.PI / 2, 0]} castShadow>
          <torusGeometry args={[radius - 0.045, 0.05, 10, 28]} />
          <meshStandardMaterial {...RUBBER} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[radius - 0.1, 0.014, 6, 28]} />
          <meshStandardMaterial {...CHROME} />
        </mesh>
        {spokes.map((angle) => (
          <mesh key={angle} rotation={[angle, 0, 0]}>
            <boxGeometry args={[0.008, (radius - 0.1) * 2, 0.008]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        ))}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.12, 14]} />
          <meshStandardMaterial {...METAL} />
        </mesh>
      </group>
    </group>
  )
}

/** A tube between two points. */
function Tube({ from, to, radius, material }: { from: [number, number, number]; to: [number, number, number]; radius: number; material: object }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const direction = b.clone().sub(a)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
    return { position: a.clone().add(b).multiplyScalar(0.5), quaternion: q, length: direction.length() }
  }, [from, to])
  return (
    <mesh position={position} quaternion={quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, length, 10]} />
      <meshStandardMaterial {...material} />
    </mesh>
  )
}

export function Bike3D({
  look,
  speed = 0,
  lean = 0,
  plateSeed = "tiral",
  mirroredText = false
}: {
  look: BikeLook
  /** Ground speed in m/s (spins the wheels). */
  speed?: number
  /** Lean into a turn, radians (positive = right). */
  lean?: number
  plateSeed?: string
  /** The map mirrors the model; flip the plate and slogan back so they read. */
  mirroredText?: boolean
}) {
  const model = findBikeModel(look.model)
  const { build } = model
  const paint = bikePaintColor(look)
  const seat = findSeatCover(look.seat)
  const slogan = look.slogan === null ? null : MUDFLAP_SLOGANS[look.slogan] ?? null
  const r = build.wheelRadius
  const rearZ = -WHEELBASE / 2
  const frontZ = WHEELBASE / 2

  const seatMap = useMemo(() => seatTexture(seat.pattern, seat.color), [seat.pattern, seat.color])
  const flapMap = useMemo(() => sloganTexture(slogan), [slogan])
  const plateMap = useMemo(() => plateTexture(plateFor(plateSeed)), [plateSeed])
  useEffect(
    () => () => {
      seatMap?.dispose()
      flapMap?.dispose()
      plateMap?.dispose()
    },
    [seatMap, flapMap, plateMap]
  )

  const wheels = useRef<Array<THREE.Group | null>>([null, null])
  const leanRef = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    const spin = (speed / r) * delta
    for (const wheel of wheels.current) if (wheel) wheel.rotation.x += spin
    if (leanRef.current) {
      leanRef.current.rotation.z += (-lean - leanRef.current.rotation.z) * Math.min(1, delta * 6)
    }
  })

  // Chrome: a fully metallic surface needs reflections to look bright, and the
  // map and showroom have none, so it's a light, half-metallic, glossy silver.
  const paintMaterial =
    look.paint === "chrome"
      ? { color: "#f1f5f9", metalness: 0.5, roughness: 0.12 }
      : { color: paint, metalness: 0.35, roughness: look.paint === "matte" ? 0.8 : 0.3 }
  const trimMaterial = { color: build.trim, metalness: 0.4, roughness: 0.5 }
  const headY = 0.92
  const headZ = 0.47
  const fluffy = seat.pattern === "fluffy"

  return (
    <group ref={leanRef}>
      <Wheel z={rearZ} radius={r} spinRef={(node) => (wheels.current[0] = node)} />
      <Wheel z={frontZ} radius={r} spinRef={(node) => (wheels.current[1] = node)} />

      {/* Front fork and steering head */}
      {[-0.07, 0.07].map((x) => (
        <Tube key={x} from={[x, r, frontZ]} to={[x, headY, headZ]} radius={0.022} material={CHROME} />
      ))}
      <mesh position={[0, headY + 0.02, headZ]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.14, 12]} />
        <meshStandardMaterial {...trimMaterial} />
      </mesh>

      {/* Handlebar, grips, mirrors */}
      <mesh position={[0, GRIP_Y, GRIP_Z]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.014, 0.014, GRIP_HALF_WIDTH * 2, 10]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (GRIP_HALF_WIDTH - 0.05), GRIP_Y, GRIP_Z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.022, 0.022, 0.11, 10]} />
            <meshStandardMaterial color={look.grips} roughness={0.8} />
          </mesh>
          {look.tassels && (
            <mesh position={[side * GRIP_HALF_WIDTH, GRIP_Y - 0.07, GRIP_Z]}>
              <coneGeometry args={[0.03, 0.14, 8]} />
              <meshStandardMaterial color={side < 0 ? "#facc15" : "#dc2626"} roughness={0.9} />
            </mesh>
          )}
          <Tube from={[side * 0.24, GRIP_Y, GRIP_Z]} to={[side * 0.3, GRIP_Y + 0.22, GRIP_Z - 0.02]} radius={0.007} material={CHROME} />
          <mesh position={[side * 0.31, GRIP_Y + 0.26, GRIP_Z - 0.02]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.045, 0.045, 0.012, 16]} />
            <meshStandardMaterial {...CHROME} />
          </mesh>
        </group>
      ))}

      {/* Headlamp with a painted cowl */}
      <mesh position={[0, 0.88, 0.56]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.07, 0.1, 16]} />
        <meshStandardMaterial {...paintMaterial} />
      </mesh>
      <mesh position={[0, 0.88, 0.615]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.07, 16]} />
        <meshStandardMaterial color="#fffbeb" emissive="#fde68a" emissiveIntensity={0.8} />
      </mesh>

      {/* Front mudguard */}
      <mesh position={[0, r, frontZ]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[r + 0.03, 0.035, 6, 16, Math.PI * 0.55]} />
        <meshStandardMaterial {...paintMaterial} />
      </mesh>

      {/* Frame */}
      <Tube from={[0, headY - 0.05, headZ - 0.03]} to={[0, 0.42, 0.12]} radius={0.03} material={trimMaterial} />
      <Tube from={[0, headY - 0.02, headZ - 0.05]} to={[0, 0.72, -0.5]} radius={0.028} material={trimMaterial} />
      {[-0.11, 0.11].map((x) => (
        <Tube key={x} from={[x, 0.42, -0.05]} to={[x, r, rearZ]} radius={0.022} material={trimMaterial} />
      ))}
      {[-0.12, 0.12].map((x) => (
        <Tube key={x} from={[x, 0.72, -0.45]} to={[x, r + 0.02, rearZ + 0.02]} radius={0.02} material={CHROME} />
      ))}

      {/* Engine or battery */}
      {build.electric ? (
        <group position={[0, 0.42, -0.02]}>
          <mesh castShadow>
            <boxGeometry args={[0.26, 0.24, 0.42]} />
            <meshStandardMaterial color="#1f2937" metalness={0.3} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.27, 0.03, 0.43]} />
            <meshStandardMaterial color={build.trim} emissive={build.trim} emissiveIntensity={0.4} />
          </mesh>
        </group>
      ) : (
        <group position={[0, 0.4, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.24, 0.26, 0.32]} />
            <meshStandardMaterial {...ENGINE} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, 0.16 + i * 0.03, 0.06]}>
              <boxGeometry args={[0.26, 0.012, 0.22]} />
              <meshStandardMaterial {...METAL} />
            </mesh>
          ))}
          {/* Exhaust */}
          <Tube from={[0.12, -0.08, 0.1]} to={[0.16, 0.0, -0.5]} radius={0.03} material={CHROME} />
          <mesh position={[0.17, 0.02, -0.62]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.04, 0.26, 12]} />
            <meshStandardMaterial {...CHROME} />
          </mesh>
        </group>
      )}

      {/* Tank */}
      <mesh
        position={[0, 0.8, 0.22]}
        scale={build.tank === "boxy" ? [0.17, 0.12, 0.24] : build.tank === "sport" ? [0.18, 0.13, 0.27] : [0.17, 0.13, 0.22]}
        castShadow
      >
        <sphereGeometry args={[1, 18, 12]} />
        <meshStandardMaterial {...paintMaterial} />
      </mesh>
      {/* Side panels under the seat */}
      <mesh position={[0, 0.66, -0.22]} castShadow>
        <boxGeometry args={[0.26, 0.16, 0.42]} />
        <meshStandardMaterial {...paintMaterial} />
      </mesh>

      {/* Long boda seat (rider + passenger) */}
      <mesh position={[0, 0.79, -0.27]} castShadow>
        <boxGeometry args={[fluffy ? 0.32 : 0.28, fluffy ? 0.13 : 0.09, 0.78]} />
        <meshStandardMaterial map={seatMap ?? undefined} color={seatMap ? "#ffffff" : seat.color} roughness={fluffy ? 1 : 0.7} />
      </mesh>
      {/* Passenger grab rail */}
      <Tube from={[-0.15, 0.85, -0.55]} to={[-0.15, 0.85, -0.72]} radius={0.012} material={CHROME} />
      <Tube from={[0.15, 0.85, -0.55]} to={[0.15, 0.85, -0.72]} radius={0.012} material={CHROME} />
      <Tube from={[-0.15, 0.85, -0.72]} to={[0.15, 0.85, -0.72]} radius={0.012} material={CHROME} />

      {/* Rear mudguard, tail light, plate, mudflap */}
      <mesh position={[0, r, rearZ]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[r + 0.04, 0.045, 6, 16, Math.PI * 0.6]} />
        <meshStandardMaterial {...paintMaterial} />
      </mesh>
      <mesh position={[0, 0.74, -0.86]}>
        <boxGeometry args={[0.1, 0.05, 0.04]} />
        <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0.63, -0.9]} rotation={[0, Math.PI, 0]} scale={[mirroredText ? -1 : 1, 1, 1]}>
        <planeGeometry args={[0.2, 0.067]} />
        <meshStandardMaterial map={plateMap ?? undefined} color={plateMap ? "#ffffff" : "#facc15"} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.2, rearZ - r - 0.04]} rotation={[0, Math.PI, 0]} scale={[mirroredText ? -1 : 1, 1, 1]}>
        <planeGeometry args={[0.24, 0.16]} />
        <meshStandardMaterial map={flapMap ?? undefined} color={flapMap ? "#ffffff" : "#111827"} side={THREE.DoubleSide} roughness={0.9} />
      </mesh>

      {/* Footrests */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.2, 0.3, 0.02]}>
            <boxGeometry args={[0.12, 0.025, 0.05]} />
            <meshStandardMaterial {...RUBBER} />
          </mesh>
          <mesh position={[side * 0.2, 0.36, -0.42]}>
            <boxGeometry args={[0.1, 0.022, 0.045]} />
            <meshStandardMaterial {...RUBBER} />
          </mesh>
        </group>
      ))}

      {/* Optional extras */}
      {look.rack && (
        <group position={[0, 0.88, -0.86]}>
          <mesh>
            <boxGeometry args={[0.3, 0.02, 0.26]} />
            <meshStandardMaterial {...METAL} />
          </mesh>
        </group>
      )}
      {look.crashBars &&
        [-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.2, 0.45, 0.2]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.09, 0.016, 8, 16, Math.PI]} />
            <meshStandardMaterial {...CHROME} />
          </mesh>
        ))}
      {look.underglow && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.5, 1.4]} />
          <meshBasicMaterial color={look.underglow} transparent opacity={0.45} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
