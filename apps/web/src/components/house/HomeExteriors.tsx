"use client"

import type { HousingTierId } from "@tiral/game-core"

// The building around your room, one per rented home: simple boxes and planes
// (cheap on phones). Your room is the open corner of it, centred on the
// origin; `h` is half its width. Ground level is y = 0, and an upstairs flat's
// floor is at `level`.

type V3 = [number, number, number]

const GROUND = -0.24

/** A box from its bounds. */
function Block({ from, to, color, roughness = 0.9 }: { from: V3; to: V3; color: string; roughness?: number }) {
  // Anything standing on the ground goes down to the grass (it's 0.24 below the floors).
  const y0 = from[1] === 0 ? GROUND : from[1]
  const size: V3 = [to[0] - from[0], to[1] - y0, to[2] - from[2]]
  const position: V3 = [(from[0] + to[0]) / 2, (y0 + to[1]) / 2, (from[2] + to[2]) / 2]
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  )
}

/** A door or window on a wall: a flat panel facing +z (or +x with `side`). */
function Panel({ at, size, color, side = false, glass = false }: { at: V3; size: [number, number]; color: string; side?: boolean; glass?: boolean }) {
  return (
    <mesh position={at} rotation={[0, side ? Math.PI / 2 : 0, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} roughness={glass ? 0.2 : 0.8} metalness={glass ? 0.3 : 0} />
    </mesh>
  )
}

/** A single-slope iron-sheet roof over a box, high at the back. */
function Mabati({ from, to, height, color = "#9AA5AD" }: { from: [number, number]; to: [number, number]; height: number; color?: string }) {
  const width = to[0] - from[0] + 0.4
  const depth = to[1] - from[1] + 0.6
  return (
    <mesh position={[(from[0] + to[0]) / 2, height + 0.18, (from[1] + to[1]) / 2]} rotation={[0.12, 0, 0]} castShadow receiveShadow>
      <boxGeometry args={[width, 0.06, depth]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.5} />
    </mesh>
  )
}

/** A pitched roof (ridge along x) over a box. */
function Gable({ from, to, height, color }: { from: [number, number]; to: [number, number]; height: number; color: string }) {
  const width = to[0] - from[0] + 0.5
  const half = (to[1] - from[1]) / 2 + 0.3
  const pitch = 0.45
  const slope = half / Math.cos(pitch)
  const cx = (from[0] + to[0]) / 2
  const cz = (from[1] + to[1]) / 2
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[cx, height + (Math.tan(pitch) * half) / 2, cz + (side * half) / 2]}
          rotation={[side * pitch, 0, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width, 0.1, slope]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function Tree({ at, scale = 1 }: { at: [number, number]; scale?: number }) {
  return (
    <group position={[at[0], 0, at[1]]} scale={scale}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 1.8, 8]} />
        <meshStandardMaterial color="#6B4A2B" roughness={1} />
      </mesh>
      <mesh position={[0, 2.3, 0]} castShadow>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial color="#4E8B3A" roughness={1} />
      </mesh>
    </group>
  )
}

const CLOTHES = ["#E85F0C", "#1E56A8", "#F2C14E", "#2F7D4A", "#C2185B", "#F5F5F4"]

/** A washing line between two poles with clothes drying on it. */
function WashingLine({ fromX, toX, z }: { fromX: number; toX: number; z: number }) {
  const step = (toX - fromX) / (CLOTHES.length + 1)
  return (
    <group>
      {[fromX, toX].map((x) => (
        <Block key={x} from={[x - 0.04, 0, z - 0.04]} to={[x + 0.04, 1.9, z + 0.04]} color="#6B4A2B" />
      ))}
      <Block from={[fromX, 1.84, z - 0.01]} to={[toX, 1.86, z + 0.01]} color="#444" />
      {CLOTHES.map((color, i) => (
        <Block key={color} from={[fromX + step * (i + 1) - 0.18, 1.3, z - 0.01]} to={[fromX + step * (i + 1) + 0.18, 1.84, z + 0.01]} color={color} />
      ))}
    </group>
  )
}

/** A unit in a row of rentals: walls, a door and a small window on the front. */
function RentalUnit({ x0, x1, h, height, color, door }: { x0: number; x1: number; h: number; height: number; color: string; door: string }) {
  const mid = (x0 + x1) / 2
  return (
    <group>
      <Block from={[x0, 0, -h]} to={[x1, height, h]} color={color} />
      <Panel at={[mid - 0.7, 0.95, h + 0.01]} size={[0.8, 1.9]} color={door} />
      <Panel at={[mid + 0.8, 1.5, h + 0.01]} size={[0.7, 0.55]} color="#33475B" glass />
    </group>
  )
}

function Kisenyi({ h }: { h: number }) {
  return (
    <group>
      <RentalUnit x0={-h - 4} x1={-h} h={h} height={2.4} color="#D9CBA8" door="#2F5D8A" />
      <RentalUnit x0={-h - 8} x1={-h - 4} h={h} height={2.4} color="#CDBE9A" door="#6B3F1F" />
      <Mabati from={[-h - 8, -h]} to={[-h, h]} height={2.4} />
      <WashingLine fromX={-h - 7.5} toX={-h - 0.8} z={h + 2.2} />
      {/* Jerrycans by the doors and a charcoal stove (sigiri) in the yard. */}
      {[-h - 2.9, -h - 2.6, -h - 6.8].map((x) => (
        <Block key={x} from={[x, 0, h + 0.4]} to={[x + 0.24, 0.36, h + 0.6]} color="#F2C14E" />
      ))}
      <mesh position={[-h - 5.2, 0.16, h + 1.2]} castShadow>
        <cylinderGeometry args={[0.18, 0.14, 0.32, 10]} />
        <meshStandardMaterial color="#1F1F1F" roughness={0.8} />
      </mesh>
    </group>
  )
}

function Kawempe({ h }: { h: number }) {
  return (
    <group>
      <RentalUnit x0={-h - 5} x1={-h} h={h} height={2.6} color="#E8DCC0" door="#2F5D8A" />
      <RentalUnit x0={-h - 10} x1={-h - 5} h={h} height={2.6} color="#E0D2B4" door="#8A2B1F" />
      <Mabati from={[-h - 10, -h]} to={[-h, h]} height={2.6} />
      {/* The shared bathroom out back, and a water tank on a stand. */}
      <Block from={[h + 0.8, 0, -h - 0.4]} to={[h + 2.6, 2.2, -h + 1.4]} color="#CFC6B0" />
      <Panel at={[h + 1.7, 0.9, -h + 1.41]} size={[0.75, 1.8]} color="#1E56A8" />
      <Panel at={[h + 1.7, 2.0, -h + 1.41]} size={[0.5, 0.18]} color="#F5F5F4" />
      <Mabati from={[h + 0.8, -h - 0.4]} to={[h + 2.6, -h + 1.4]} height={2.2} />
      {[-0.5, 0.5].map((dx) =>
        [-0.5, 0.5].map((dz) => <Block key={`${dx}${dz}`} from={[h + 4 + dx - 0.05, 0, -h + dz - 0.05]} to={[h + 4 + dx + 0.05, 1.6, -h + dz + 0.05]} color="#555" />)
      )}
      <mesh position={[h + 4, 2.2, -h]} castShadow>
        <cylinderGeometry args={[0.7, 0.7, 1.2, 16]} />
        <meshStandardMaterial color="#1F2937" roughness={0.6} />
      </mesh>
      <WashingLine fromX={-h - 8} toX={-h - 1} z={h + 2.4} />
    </group>
  )
}

function Ntinda({ h }: { h: number }) {
  const wall = "#D8D2C4"
  const wallTop = 1.6
  const x0 = -h - 6.5
  const x1 = h + 2.5
  const z0 = -h - 2
  const z1 = h + 4
  const gate: [number, number] = [0.5, 3.5]
  return (
    <group>
      {/* The rest of the bungalow: bedroom and bathroom, under a pitched roof. */}
      <Block from={[-h - 4, 0, -h]} to={[-h, 2.5, h]} color="#F2E6CF" />
      <Panel at={[-h - 3, 1.5, h + 0.01]} size={[1, 1]} color="#33475B" glass />
      <Panel at={[-h - 1.4, 1.5, h + 0.01]} size={[0.6, 0.8]} color="#33475B" glass />
      <Gable from={[-h - 4, -h]} to={[-h, h]} height={2.5} color="#8E2F1F" />
      {/* Compound wall with a gate. */}
      <Block from={[x0, 0, z0]} to={[x1, wallTop, z0 + 0.2]} color={wall} />
      <Block from={[x0, 0, z0]} to={[x0 + 0.2, wallTop, z1]} color={wall} />
      <Block from={[x1 - 0.2, 0, z0]} to={[x1, wallTop, z1]} color={wall} />
      <Block from={[x0, 0, z1 - 0.2]} to={[gate[0], wallTop, z1]} color={wall} />
      <Block from={[gate[1], 0, z1 - 0.2]} to={[x1, wallTop, z1]} color={wall} />
      <Block from={[gate[0], 0, z1 - 0.12]} to={[gate[1], 1.8, z1 - 0.06]} color="#1F2937" roughness={0.4} />
      {/* Paved drive from the gate to the door, and a tree in the compound. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(gate[0] + gate[1]) / 2, -0.2, (h + z1) / 2]} receiveShadow>
        <planeGeometry args={[gate[1] - gate[0], z1 - h]} />
        <meshStandardMaterial color="#9CA3AF" roughness={0.95} />
      </mesh>
      <Tree at={[x0 + 1.5, z1 - 1.5]} />
    </group>
  )
}

function Kololo({ h, level }: { h: number; level: number }) {
  const top = level - 0.24
  const x0 = -h - 6
  const floors = [1.4, 1.4 + level / 2]
  return (
    <group>
      {/* The floors below your flat, and the neighbour's flat beside it. */}
      <Block from={[x0, 0, -h]} to={[h, top, h]} color="#EDE7DD" />
      <Block from={[x0, level / 2 - 0.1, -h - 0.02]} to={[h, level / 2 + 0.1, h + 0.02]} color="#FFFFFF" />
      <Block from={[x0, top, -h]} to={[-h, top + 2.8, h]} color="#E6DED2" />
      <Block from={[x0 - 0.2, top + 2.8, -h - 0.2]} to={[-h + 0.1, top + 3, h + 0.2]} color="#CFC7BB" />
      {floors.map((y, floor) =>
        [-8, -6, -4, -2, 0, 2]
          // The ground floor's entrance is between -4 and -2.
          .filter((x) => x > x0 && x < h && (floor > 0 || (x !== -4 && x !== -2)))
          .map((x) => <Panel key={`${x},${y}`} at={[x, y, h + 0.01]} size={[1.2, 1.4]} color="#3E5F80" glass />)
      )}
      {floors.map((y) => [-1.5, 1.5].map((z) => <Panel key={`${y},${z}`} at={[h + 0.01, y, z]} size={[1.2, 1.4]} color="#3E5F80" side glass />))}
      {[-7.5, -5].map((x) => (
        <Panel key={x} at={[x, top + 1.5, h + 0.01]} size={[1.2, 1.4]} color="#3E5F80" glass />
      ))}
      {/* Your balcony, with a glass railing. */}
      <Block from={[-h, top - 0.06, h]} to={[h, top + 0.06, h + 1.3]} color="#F5F5F4" />
      <mesh position={[0, top + 0.55, h + 1.3]}>
        <boxGeometry args={[2 * h, 1, 0.04]} />
        <meshStandardMaterial color="#BFD7EA" transparent opacity={0.35} roughness={0.1} />
      </mesh>
      <Block from={[-h, top + 1.02, h + 1.26]} to={[h, top + 1.08, h + 1.34]} color="#9CA3AF" />
      {/* The entrance, a paved forecourt and parked cars. */}
      <Panel at={[-3, 1.2, h + 0.01]} size={[1.6, 2.4]} color="#1F2937" glass />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.5, -0.2, h + 3.5]} receiveShadow>
        <planeGeometry args={[16, 7]} />
        <meshStandardMaterial color="#B8B8B0" roughness={0.95} />
      </mesh>
      {[
        { x: 2.5, color: "#B91C1C" },
        { x: 5.2, color: "#F5F5F4" }
      ].map((car) => (
        <group key={car.x} position={[car.x, 0, h + 4]}>
          <Block from={[-0.9, 0.15, -2]} to={[0.9, 0.85, 2]} color={car.color} roughness={0.4} />
          <Block from={[-0.8, 0.85, -1]} to={[0.8, 1.35, 0.9]} color="#33475B" roughness={0.3} />
        </group>
      ))}
      <Tree at={[x0 - 1.5, h + 3]} scale={1.3} />
    </group>
  )
}

export function HomeExterior({ home, h, level }: { home: HousingTierId; h: number; level: number }) {
  if (home === "kawempe") return <Kawempe h={h} />
  if (home === "ntinda") return <Ntinda h={h} />
  if (home === "kololo") return <Kololo h={h} level={level} />
  return <Kisenyi h={h} />
}
