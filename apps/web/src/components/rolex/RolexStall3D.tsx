"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { Html } from "@react-three/drei"
import * as THREE from "three"
import type { AvatarLoadout } from "@tiral/avatars"
import { ROLEX_FLIP_WINDOW, ROLEX_PATIENCE_SECONDS } from "@tiral/game-core"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import { passengerDummy } from "@/components/bike/BikeRider"

// A rolex stall on a Kampala street, in metres. The counter runs along X; you
// cook behind it (z < 0) and customers queue in front (z > 0).

export type RolexStep = "pick" | "crack" | "veg" | "whisk" | "pour" | "wait" | "flip" | "empty"
export type RolexTarget = "tray" | "board" | "bowl" | "pan"

export type RolexCustomer = { id: string; wants: number; served: number; leavesInMs: number }

/** What's in the bowl for the next rolex, with when each step happened (for animations). */
export type RolexPrep = {
  customerId: string | null
  eggs: number
  veg: boolean
  whisked: boolean
  crackAt: number
  vegAt: number
  whiskAt: number
}

export type RolexFlip = { result: "perfect" | "good" | "raw" | "burnt"; at: number; customerId: string | null }

const COUNTER_TOP = 0.9
const PAN = new THREE.Vector3(-0.1, COUNTER_TOP + 0.09, 0)
const TRAY = new THREE.Vector3(0.95, COUNTER_TOP, -0.12)
const BOWL = new THREE.Vector3(0.48, COUNTER_TOP, 0.1)
const BOARD = new THREE.Vector3(1.0, COUNTER_TOP, 0.24)
const CHAPATIS = new THREE.Vector3(-0.95, COUNTER_TOP, 0.12)
const SLOT_X = [-1.05, -0.35, 0.35, 1.05]
const QUEUE_Z = 1.05
const COOK_TOTAL = ROLEX_FLIP_WINDOW.end + 1.5

// ---------------------------------------------------------------------------
// Little helpers

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t))

/** Colour of the egg after `seconds` on the hot plate. */
function eggColor(seconds: number, target: THREE.Color) {
  const { start, end } = ROLEX_FLIP_WINDOW
  const raw = new THREE.Color("#fde68a")
  const golden = new THREE.Color("#f59e0b")
  const brown = new THREE.Color("#92400e")
  const burnt = new THREE.Color("#1c1009")
  if (seconds < start) return target.copy(raw).lerp(golden, ease(seconds / start))
  if (seconds < end) return target.copy(golden).lerp(brown, ((seconds - start) / (end - start)) * 0.5)
  return target.copy(brown).lerp(burnt, ease((seconds - end) / 1.2))
}

function useStripes(colors: string[]) {
  return useMemo(() => {
    if (typeof document === "undefined") return null
    const canvas = document.createElement("canvas")
    canvas.width = 256
    canvas.height = 8
    const ctx = canvas.getContext("2d")!
    const width = canvas.width / colors.length
    colors.forEach((color, index) => {
      ctx.fillStyle = color
      ctx.fillRect(index * width, 0, width + 1, canvas.height)
    })
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [colors])
}

/** Egg with bits of tomato, onion and cabbage in it. */
function useSpeckles() {
  return useMemo(() => {
    if (typeof document === "undefined") return null
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext("2d")!
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, 128, 128)
    let state = 7
    const random = () => ((state = (state * 9301 + 49297) % 233280) / 233280)
    const bits = ["#dc2626", "#16a34a", "#a855f7", "#65a30d", "#ef4444"]
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = bits[i % bits.length]!
      ctx.beginPath()
      ctx.ellipse(random() * 128, random() * 128, 1.5 + random() * 3, 1 + random() * 2, random() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])
}

/** A soft pulsing ring that shows what to tap next. */
function Hint({ position, radius, show }: { position: THREE.Vector3; radius: number; show: boolean }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 6) * 0.08
    ref.current.scale.set(pulse, pulse, pulse)
  })
  if (!show) return null
  return (
    <mesh ref={ref} position={[position.x, COUNTER_TOP + 0.012, position.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
      <ringGeometry args={[radius, radius + 0.035, 40]} />
      <meshBasicMaterial color="#facc15" transparent opacity={0.9} />
    </mesh>
  )
}

/** Something on the counter you can tap. */
function Tappable({ onTap, children }: { onTap(): void; children: ReactNode }) {
  return (
    <group
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()
        onTap()
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      {children}
    </group>
  )
}

// ---------------------------------------------------------------------------
// The stall

function Street() {
  const buildings = useMemo(
    () => [
      { x: -6, w: 4, h: 4.5, color: "#e7c9a0" },
      { x: -1.6, w: 3.6, h: 6, color: "#9fb7c9" },
      { x: 2.4, w: 3.2, h: 4, color: "#f2b880" },
      { x: 6.2, w: 4.2, h: 5.2, color: "#cfd8a8" }
    ],
    []
  )
  return (
    <group>
      {/* Murram roadside */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#8a5a3c" roughness={1} />
      </mesh>
      {/* The tarmac road beyond the customers */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 4.6]} receiveShadow>
        <planeGeometry args={[40, 4.2]} />
        <meshStandardMaterial color="#374151" roughness={0.9} />
      </mesh>
      {[-6, -2, 2, 6].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.008, 4.6]}>
          <planeGeometry args={[1.4, 0.12]} />
          <meshBasicMaterial color="#e5e7eb" />
        </mesh>
      ))}
      {/* Shops across the road */}
      {buildings.map((building) => (
        <group key={building.x} position={[building.x, 0, 9]}>
          <mesh position={[0, building.h / 2, 0]} receiveShadow>
            <boxGeometry args={[building.w, building.h, 2]} />
            <meshStandardMaterial color={building.color} roughness={0.95} />
          </mesh>
          <mesh position={[0, 1.1, -1.01]}>
            <planeGeometry args={[building.w * 0.6, 2.2]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Stall({ next, onTap }: { next: RolexTarget | null; onTap(target: RolexTarget): void }) {
  const canopy = useStripes(["#dc2626", "#facc15", "#16a34a", "#facc15", "#dc2626", "#2563eb", "#facc15", "#2563eb"])
  const eggs = useMemo(() => {
    const spots: Array<[number, number]> = []
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) spots.push([(col - 1.5) * 0.075, (row - 1) * 0.075])
    return spots
  }, [])
  return (
    <group>
      {/* Counter: a wooden table with a cloth front */}
      <mesh position={[0, COUNTER_TOP - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.9, 0.06, 0.9]} />
        <meshStandardMaterial color="#a16207" roughness={0.8} />
      </mesh>
      <mesh position={[0, COUNTER_TOP / 2 - 0.03, 0.44]} castShadow>
        <boxGeometry args={[2.86, COUNTER_TOP - 0.06, 0.02]} />
        <meshStandardMaterial color="#1d4ed8" roughness={0.9} />
      </mesh>
      {[-1.38, 1.38].map((x) =>
        [-0.4, 0.4].map((z) => (
          <mesh key={`${x}${z}`} position={[x, (COUNTER_TOP - 0.06) / 2, z]} castShadow>
            <boxGeometry args={[0.06, COUNTER_TOP - 0.06, 0.06]} />
            <meshStandardMaterial color="#713f12" />
          </mesh>
        ))
      )}

      {/* Umbrella */}
      <mesh position={[1.5, 1.7, 0.05]} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 3.4, 8]} />
        <meshStandardMaterial color="#e5e7eb" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0.5, 3.5, 0.2]} castShadow>
        <coneGeometry args={[1.8, 0.5, 24, 1, true]} />
        <meshStandardMaterial map={canopy} side={THREE.DoubleSide} roughness={0.85} transparent opacity={0.96} />
      </mesh>

      {/* Charcoal stove (sigiri) with the hot plate on it */}
      <Tappable onTap={() => onTap("pan")}>
        <mesh position={[PAN.x, COUNTER_TOP + 0.03, PAN.z]} castShadow>
          <cylinderGeometry args={[0.3, 0.26, 0.06, 24]} />
          <meshStandardMaterial color="#44403c" roughness={0.9} />
        </mesh>
        <mesh position={[PAN.x, COUNTER_TOP + 0.065, PAN.z]}>
          <torusGeometry args={[0.29, 0.012, 8, 32]} />
          <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={1.4} />
        </mesh>
        <mesh position={[PAN.x, PAN.y - 0.01, PAN.z]} castShadow receiveShadow>
          <cylinderGeometry args={[0.34, 0.34, 0.02, 32]} />
          <meshStandardMaterial color="#71717a" metalness={0.15} roughness={0.55} />
        </mesh>
      </Tappable>
      <Hint position={PAN} radius={0.37} show={next === "pan"} />

      {/* Egg tray */}
      <Tappable onTap={() => onTap("tray")}>
        <mesh position={[TRAY.x, COUNTER_TOP + 0.015, TRAY.z]} castShadow>
          <boxGeometry args={[0.32, 0.03, 0.25]} />
          <meshStandardMaterial color="#d6c7a1" roughness={1} />
        </mesh>
        {eggs.map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[TRAY.x + x, COUNTER_TOP + 0.06, TRAY.z + z]} scale={[1, 1.3, 1]} castShadow>
            <sphereGeometry args={[0.03, 12, 10]} />
            <meshStandardMaterial color="#f5e6d3" roughness={0.6} />
          </mesh>
        ))}
      </Tappable>
      <Hint position={TRAY} radius={0.22} show={next === "tray"} />

      {/* Chopping board: tomato, onion, cabbage */}
      <Tappable onTap={() => onTap("board")}>
        <mesh position={[BOARD.x, COUNTER_TOP + 0.012, BOARD.z]} castShadow>
          <boxGeometry args={[0.34, 0.025, 0.2]} />
          <meshStandardMaterial color="#d97706" roughness={0.8} />
        </mesh>
        <mesh position={[BOARD.x - 0.1, COUNTER_TOP + 0.06, BOARD.z]} castShadow>
          <sphereGeometry args={[0.04, 14, 12]} />
          <meshStandardMaterial color="#dc2626" roughness={0.4} />
        </mesh>
        <mesh position={[BOARD.x, COUNTER_TOP + 0.06, BOARD.z + 0.02]} castShadow>
          <sphereGeometry args={[0.038, 14, 12]} />
          <meshStandardMaterial color="#c4b5fd" roughness={0.5} />
        </mesh>
        <mesh position={[BOARD.x + 0.1, COUNTER_TOP + 0.07, BOARD.z - 0.01]} castShadow>
          <sphereGeometry args={[0.055, 14, 12]} />
          <meshStandardMaterial color="#84cc16" roughness={0.7} />
        </mesh>
      </Tappable>
      <Hint position={BOARD} radius={0.21} show={next === "board"} />

      {/* Chapati stack */}
      {[0, 1, 2, 3, 4].map((index) => (
        <mesh key={index} position={[CHAPATIS.x, COUNTER_TOP + 0.01 + index * 0.012, CHAPATIS.z]} rotation={[0, index, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.16, 0.01, 20]} />
          <meshStandardMaterial color={index % 2 ? "#e2b26b" : "#d9a35a"} roughness={0.9} />
        </mesh>
      ))}

      {/* A cooking-oil bottle and the paper for wrapping */}
      <mesh position={[-0.7, COUNTER_TOP + 0.12, -0.25]} castShadow>
        <cylinderGeometry args={[0.04, 0.045, 0.24, 12]} />
        <meshStandardMaterial color="#facc15" transparent opacity={0.75} roughness={0.2} />
      </mesh>
      <mesh position={[-1.2, COUNTER_TOP + 0.005, -0.2]} rotation={[-Math.PI / 2, 0, 0.3]}>
        <planeGeometry args={[0.25, 0.2]} />
        <meshStandardMaterial color="#f5f5f4" />
      </mesh>
    </group>
  )
}

/** The mixing bowl and what's in it for the next rolex. */
function Bowl({ prep, next, onTap }: { prep: RolexPrep; next: RolexTarget | null; onTap(): void }) {
  const speckles = useSpeckles()
  const spoon = useRef<THREE.Group>(null)
  const flying = useRef<THREE.Group>(null)
  const bits = useRef<THREE.Group>(null)
  useFrame(() => {
    const now = Date.now()
    // The spoon stirs for a moment after you whisk.
    if (spoon.current) {
      const stirring = now - prep.whiskAt < 700
      spoon.current.rotation.y = stirring ? (now - prep.whiskAt) / 70 : 0.6
    }
    // An egg arcs from the tray into the bowl.
    if (flying.current) {
      const t = (now - prep.crackAt) / 380
      flying.current.visible = t >= 0 && t < 1
      if (flying.current.visible) {
        flying.current.position.lerpVectors(TRAY, BOWL, t)
        flying.current.position.y = COUNTER_TOP + 0.08 + Math.sin(t * Math.PI) * 0.25
      }
    }
    // Chopped veg tumbles in.
    if (bits.current) {
      const t = (now - prep.vegAt) / 380
      bits.current.visible = t >= 0 && t < 1
      if (bits.current.visible) {
        bits.current.position.lerpVectors(BOARD, BOWL, t)
        bits.current.position.y = COUNTER_TOP + 0.08 + Math.sin(t * Math.PI) * 0.2
      }
    }
  })
  const fill = prep.eggs === 0 ? 0 : prep.eggs === 1 ? 0.5 : 0.75
  const color = prep.whisked ? "#fbbf24" : prep.eggs ? "#fde68a" : "#ffffff"
  return (
    <group>
      <Tappable onTap={onTap}>
        <mesh position={[BOWL.x, COUNTER_TOP + 0.07, BOWL.z]} rotation={[Math.PI, 0, 0]} castShadow>
          <sphereGeometry args={[0.13, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.25} side={THREE.DoubleSide} />
        </mesh>
        {fill > 0 && (
          <mesh position={[BOWL.x, COUNTER_TOP + 0.07 - 0.13 * (1 - fill) * 0.6, BOWL.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.1 + fill * 0.025, 24]} />
            <meshStandardMaterial color={color} map={prep.veg ? speckles : null} roughness={0.4} />
          </mesh>
        )}
      </Tappable>
      <group ref={spoon} position={[BOWL.x, COUNTER_TOP + 0.08, BOWL.z]}>
        <mesh position={[0.06, 0.08, 0]} rotation={[0, 0, -0.5]}>
          <cylinderGeometry args={[0.008, 0.008, 0.22, 6]} />
          <meshStandardMaterial color="#9ca3af" metalness={0.6} />
        </mesh>
      </group>
      <group ref={flying} visible={false}>
        <mesh scale={[1, 1.3, 1]}>
          <sphereGeometry args={[0.03, 12, 10]} />
          <meshStandardMaterial color="#f5e6d3" />
        </mesh>
      </group>
      <group ref={bits} visible={false}>
        {[
          ["#dc2626", 0.02, 0],
          ["#84cc16", -0.02, 0.02],
          ["#c4b5fd", 0, -0.02]
        ].map(([c, x, z]) => (
          <mesh key={c as string} position={[x as number, 0, z as number]}>
            <boxGeometry args={[0.025, 0.02, 0.025]} />
            <meshStandardMaterial color={c as string} />
          </mesh>
        ))}
      </group>
      <Hint position={BOWL} radius={0.17} show={next === "bowl"} />
    </group>
  )
}

/** The egg frying on the plate, then flipped, rolled in a chapati and handed over. */
function Griddle({
  cooking,
  flip,
  customerX
}: {
  cooking: { since: number } | null
  flip: RolexFlip | null
  customerX(id: string | null): number
}) {
  const speckles = useSpeckles()
  const omelette = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshStandardMaterial>(null)
  const chapati = useRef<THREE.Mesh>(null)
  const rolled = useRef<THREE.Group>(null)
  const steam = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const seeds = useMemo(() => Array.from({ length: 14 }, (_, index) => ({ x: Math.sin(index * 12.9) * 0.15, z: Math.cos(index * 7.3) * 0.15, phase: index / 14 })), [])
  // The colour the egg had when it was flipped.
  const flipColor = useMemo(() => {
    const seconds = flip ? (flip.result === "raw" ? 1.5 : flip.result === "burnt" ? COOK_TOTAL + 0.6 : (ROLEX_FLIP_WINDOW.start + ROLEX_FLIP_WINDOW.end) / 2) : 0
    return eggColor(seconds, new THREE.Color())
  }, [flip])

  useFrame(({ clock }) => {
    const now = Date.now()
    const egg = omelette.current
    const paper = chapati.current
    const roll = rolled.current
    if (!egg || !paper || !roll || !material.current) return
    egg.visible = false
    paper.visible = false
    roll.visible = false
    let smoke = 0
    if (cooking) {
      const seconds = (now - cooking.since) / 1000
      const spread = ease(seconds / 0.35)
      egg.visible = true
      egg.position.set(PAN.x, PAN.y + 0.012, PAN.z)
      egg.rotation.set(-Math.PI / 2, 0, 0)
      egg.scale.set(spread, spread, 1)
      material.current.color.copy(eggColor(seconds, color))
      smoke = seconds > ROLEX_FLIP_WINDOW.end ? 2 : 1
    } else if (flip) {
      const t = (now - flip.at) / 1000
      material.current.color.copy(flipColor)
      if (flip.result === "burnt") {
        // Scraped off the plate into the bin.
        if (t < 0.8) {
          egg.visible = true
          egg.position.set(PAN.x - t * 1.2, PAN.y + 0.012 + Math.sin(Math.min(1, t / 0.8) * Math.PI) * 0.2, PAN.z - t * 0.4)
          egg.rotation.set(-Math.PI / 2 + t * 4, 0, 0)
          egg.scale.set(1, 1, 1)
          smoke = 2
        }
      } else if (t < 0.35) {
        // Flip.
        egg.visible = true
        egg.position.set(PAN.x, PAN.y + 0.012 + Math.sin((t / 0.35) * Math.PI) * 0.18, PAN.z)
        egg.rotation.set(-Math.PI / 2 + (t / 0.35) * Math.PI * 2, 0, 0)
        egg.scale.set(1, 1, 1)
      } else if (t < 0.75) {
        // The chapati goes on top.
        egg.visible = true
        egg.position.set(PAN.x, PAN.y + 0.012, PAN.z)
        egg.rotation.set(-Math.PI / 2, 0, 0)
        paper.visible = true
        const drop = ease((t - 0.35) / 0.4)
        paper.position.set(
          THREE.MathUtils.lerp(CHAPATIS.x, PAN.x, drop),
          PAN.y + 0.02 + Math.sin(drop * Math.PI) * 0.15,
          THREE.MathUtils.lerp(CHAPATIS.z, PAN.z, drop)
        )
        paper.scale.set(1, 1, 1)
      } else if (t < 1.15) {
        // Rolled up.
        const r = ease((t - 0.75) / 0.4)
        paper.visible = r < 0.6
        paper.position.set(PAN.x, PAN.y + 0.02, PAN.z)
        paper.scale.set(1 - r, 1, 1 - r * 0.4)
        roll.visible = true
        roll.position.set(PAN.x, PAN.y + 0.05, PAN.z)
        roll.scale.setScalar(Math.max(0.05, r))
      } else if (t < 1.9) {
        // Handed over the counter.
        const h = ease((t - 1.15) / 0.75)
        roll.visible = true
        roll.scale.setScalar(1)
        roll.position.set(
          THREE.MathUtils.lerp(PAN.x, customerX(flip.customerId), h),
          PAN.y + 0.05 + Math.sin(h * Math.PI) * 0.3 + h * 0.25,
          THREE.MathUtils.lerp(PAN.z, QUEUE_Z - 0.35, h)
        )
      }
    }
    // Steam (or smoke when it's burning).
    if (steam.current) {
      seeds.forEach((seed, index) => {
        const life = (clock.elapsedTime * 0.7 + seed.phase) % 1
        dummy.position.set(PAN.x + seed.x * (1 + life), PAN.y + 0.05 + life * 0.6, PAN.z + seed.z)
        dummy.scale.setScalar(smoke ? (0.03 + life * 0.06) * (smoke === 2 ? 1.6 : 1) : 0)
        dummy.updateMatrix()
        steam.current!.setMatrixAt(index, dummy.matrix)
      })
      steam.current.instanceMatrix.needsUpdate = true
      ;(steam.current.material as THREE.MeshBasicMaterial).color.set(smoke === 2 ? "#3f3f46" : "#f1f5f9")
    }
  })

  return (
    <group>
      <mesh ref={omelette} visible={false} raycast={() => null}>
        <circleGeometry args={[0.24, 32]} />
        <meshStandardMaterial ref={material} map={speckles} roughness={0.55} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={chapati} visible={false} raycast={() => null}>
        <cylinderGeometry args={[0.2, 0.2, 0.01, 24]} />
        <meshStandardMaterial color="#e2b26b" roughness={0.9} />
      </mesh>
      <group ref={rolled} visible={false}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.24, 16]} />
          <meshStandardMaterial color="#d9a35a" roughness={0.85} />
        </mesh>
        <mesh position={[0.07, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.048, 0.048, 0.1, 16]} />
          <meshStandardMaterial color="#f5f5f4" roughness={0.9} />
        </mesh>
      </group>
      <instancedMesh ref={steam} args={[undefined, undefined, seeds.length]} raycast={() => null}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial transparent opacity={0.35} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Customers

type Shown = RolexCustomer & { slot: number; leaving: boolean; leftAt: number }

/** Keep customers on screen while they walk off after leaving the queue. */
function useShownCustomers(customers: RolexCustomer[]) {
  const [shown, setShown] = useState<Shown[]>([])
  useEffect(() => {
    setShown((previous) => {
      const now = Date.now()
      const next: Shown[] = customers.map((customer, index) => ({ ...customer, slot: index, leaving: false, leftAt: 0 }))
      for (const old of previous) {
        if (customers.some((customer) => customer.id === old.id)) continue
        const leftAt = old.leaving ? old.leftAt : now
        if (now - leftAt < 4000) next.push({ ...old, leaving: true, leftAt })
      }
      return next
    })
  }, [customers])
  return shown
}

function Customer({
  customer,
  selected,
  cooking,
  received,
  onPick
}: {
  customer: Shown
  selected: boolean
  cooking: boolean
  received: number
  onPick(): void
}) {
  const group = useRef<THREE.Group>(null)
  const [walking, setWalking] = useState(true)
  const look = useMemo(() => passengerDummy(customer.id), [customer.id])
  const target = customer.leaving ? -6 : SLOT_X[customer.slot] ?? 0
  useFrame((_, delta) => {
    const body = group.current
    if (!body) return
    if (body.userData.placed !== true) {
      body.position.set(6, 0, QUEUE_Z)
      body.userData.placed = true
    }
    const gap = target - body.position.x
    const moving = Math.abs(gap) > 0.03
    if (moving) {
      body.position.x += Math.sign(gap) * Math.min(Math.abs(gap), delta * 1.5)
      body.rotation.y = gap > 0 ? Math.PI / 2 : -Math.PI / 2
    } else {
      body.rotation.y = Math.PI
    }
    if (moving !== walking) setWalking(moving)
  })
  const left = Math.max(0, customer.leavesInMs - (Date.now() - received))
  const patience = left / (ROLEX_PATIENCE_SECONDS * 1000)
  return (
    <group ref={group}>
      <RealisticAvatar loadout={look} moving={walking} />
      {/* A bigger, invisible body to tap */}
      {!customer.leaving && (
        <mesh
          position={[0, 0.95, 0]}
          onClick={(event) => {
            event.stopPropagation()
            onPick()
          }}
          onPointerOver={() => (document.body.style.cursor = "pointer")}
          onPointerOut={() => (document.body.style.cursor = "")}
        >
          <boxGeometry args={[0.6, 1.9, 0.5]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
      {!customer.leaving && !walking && (
        <Html position={[0, 1.3, 0.3]} center zIndexRange={[5, 0]}>
          <button
            type="button"
            onClick={onPick}
            className={`flex w-[74px] flex-col items-center gap-1 rounded-xl border px-1.5 py-1 text-[11px] font-black text-white shadow-lg ${
              selected ? "border-amber-300 bg-amber-500/90 text-slate-950" : cooking ? "border-orange-300 bg-orange-600/90" : "border-white/20 bg-slate-950/85"
            }`}
          >
            <span>
              🌯 {customer.served}/{customer.wants}
            </span>
            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-white/20">
              <span
                className="block h-full rounded-full"
                style={{ width: `${patience * 100}%`, background: left < 12_000 ? "#f43f5e" : "#34d399" }}
              />
            </span>
          </button>
        </Html>
      )}
    </group>
  )
}

// ---------------------------------------------------------------------------

function CameraRig({ showcase }: { showcase?: boolean }) {
  const { camera, size } = useThree()
  useEffect(() => {
    const lens = camera as THREE.PerspectiveCamera
    const aspect = size.width / Math.max(1, size.height)
    // Behind and above the cook, looking over the counter at the queue. Tall
    // phone screens get a wider lens and step back so the whole stall fits.
    const portrait = aspect < 1
    lens.fov = portrait ? 64 : 44
    const back = portrait ? Math.min(2.1, 1.1 / aspect) : 1
    lens.position.set((portrait ? 0.3 : 0.55) * back, 2.3 + 0.85 * back, -1.75 - 1.05 * back)
    lens.lookAt(portrait ? -0.2 : 0, portrait ? 1.0 : 0.85, 0.65)
    // Phones: the HUD covers the top of the screen, so slide the stall down
    // into the open middle.
    if (portrait) lens.setViewOffset(size.width, size.height, 0, -size.height * 0.14, size.width, size.height)
    // The start screen's card sits on the right: slide the stall left.
    else if (showcase) lens.setViewOffset(size.width, size.height, size.width * 0.15, 0, size.width, size.height)
    else lens.clearViewOffset()
    lens.updateProjectionMatrix()
  }, [camera, size.width, size.height, showcase])
  return null
}

/** The 3D rolex stall: tap customers, the egg tray, veg, bowl and hot plate. */
export function RolexStall3D({
  customers,
  received,
  prep,
  next,
  cooking,
  flip,
  loadout,
  onPick,
  onTap,
  showcase
}: {
  customers: RolexCustomer[]
  /** Local time the customer timers were measured at. */
  received: number
  prep: RolexPrep
  next: RolexTarget | null
  /** Local time the egg went on the plate (or null). */
  cooking: { since: number; customerId: string } | null
  flip: RolexFlip | null
  loadout: AvatarLoadout
  onPick(customerId: string): void
  onTap(target: RolexTarget): void
  /** A hands-off view behind the start card. */
  showcase?: boolean
}) {
  const shown = useShownCustomers(customers)
  const customerX = (id: string | null) => {
    const customer = shown.find((candidate) => candidate.id === id)
    return customer ? (SLOT_X[customer.slot] ?? 0) : 0
  }
  return (
    <div className="absolute inset-0">
      <Canvas shadows camera={{ position: [0.5, 2.8, -3.4], fov: 44 }} gl={{ antialias: true }} dpr={[1, 2]}>
        <color attach="background" args={["#7dd3fc"]} />
        <fog attach="fog" args={["#bae6fd", 12, 26]} />
        <hemisphereLight args={["#fff7e6", "#6b4f3a", 1.1]} />
        <directionalLight position={[4, 8, 3]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
        <Street />
        <Stall next={next} onTap={onTap} />
        <Bowl prep={prep} next={next} onTap={() => onTap("bowl")} />
        <Griddle cooking={cooking} flip={flip} customerX={customerX} />
        {/* You, behind the counter */}
        <group position={[-1.05, 0, -0.7]}>
          <RealisticAvatar loadout={loadout} moving={false} />
        </group>
        {shown.map((customer) => (
          <Customer
            key={customer.id}
            customer={customer}
            selected={prep.customerId === customer.id}
            cooking={cooking?.customerId === customer.id}
            received={received}
            onPick={() => onPick(customer.id)}
          />
        ))}
        <CameraRig showcase={showcase} />
      </Canvas>
    </div>
  )
}
