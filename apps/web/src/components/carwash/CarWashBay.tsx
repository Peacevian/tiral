"use client"

import { memo, useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import * as THREE from "three"
import type { AvatarLoadout } from "@tiral/avatars"
import type { WashTool } from "@tiral/game-core"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import { carLayout, type CarLayout, type ZonePanel } from "./carLayout"
import { sceneQuality } from "@/lib/deviceTier"

export type BayZone = { id: number; soap: number; dirt: number; clean: boolean }

const TEX = 128
/** Throttle per zone and tool (the server ignores anything faster than 80 ms). */
const SEND_EVERY_MS = 95

// ---------------------------------------------------------------------------
// Paintable layers: each zone has a mud canvas and a foam canvas.

type ZoneLayers = { dirt: HTMLCanvasElement; foam: HTMLCanvasElement; dirtTex: THREE.CanvasTexture; foamTex: THREE.CanvasTexture; wiped: boolean }

function makeLayers(seed: number): ZoneLayers {
  const dirt = document.createElement("canvas")
  dirt.width = dirt.height = TEX
  const foam = document.createElement("canvas")
  foam.width = foam.height = TEX
  const ctx = dirt.getContext("2d")!
  // Mud: a brown wash plus splats and streaks.
  ctx.fillStyle = "rgba(92, 64, 36, 0.78)"
  ctx.fillRect(0, 0, TEX, TEX)
  let state = seed * 9301 + 49297
  const random = () => ((state = (state * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${60 + random() * 40}, ${42 + random() * 25}, ${22 + random() * 15}, ${0.5 + random() * 0.45})`
    ctx.beginPath()
    ctx.ellipse(random() * TEX, random() * TEX, 4 + random() * 16, 3 + random() * 10, random() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = "rgba(70, 48, 26, 0.6)"
    const x = random() * TEX
    ctx.fillRect(x, random() * TEX * 0.4, 2 + random() * 3, 20 + random() * 40)
  }
  const dirtTex = new THREE.CanvasTexture(dirt)
  const foamTex = new THREE.CanvasTexture(foam)
  dirtTex.colorSpace = foamTex.colorSpace = THREE.SRGBColorSpace
  return { dirt, foam, dirtTex, foamTex, wiped: false }
}

function brush(canvas: HTMLCanvasElement, uv: THREE.Vector2, radius: number, mode: "erase" | "foam") {
  const ctx = canvas.getContext("2d")!
  const x = uv.x * TEX
  const y = (1 - uv.y) * TEX
  if (mode === "erase") {
    ctx.globalCompositeOperation = "destination-out"
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, "rgba(0,0,0,0.95)")
    gradient.addColorStop(1, "rgba(0,0,0,0)")
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = "source-over"
  } else {
    // Thick lather: a soft white patch plus bubbles.
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, "rgba(255,255,255,0.9)")
    gradient.addColorStop(1, "rgba(255,255,255,0)")
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.7 + Math.random() * 0.3})`
      ctx.beginPath()
      ctx.arc(x + (Math.random() - 0.5) * radius * 1.8, y + (Math.random() - 0.5) * radius * 1.8, 1.5 + Math.random() * radius * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ---------------------------------------------------------------------------
// Water and foam particles.

const PARTICLES = 160

type Particle = { position: THREE.Vector3; velocity: THREE.Vector3; life: number; foam: boolean }

function Spray({ emitRef }: { emitRef: React.MutableRefObject<((point: THREE.Vector3, normal: THREE.Vector3, tool: WashTool) => void) | null> }) {
  const water = useRef<THREE.InstancedMesh>(null)
  const foam = useRef<THREE.InstancedMesh>(null)
  const particles = useRef<Particle[]>([])
  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    emitRef.current = (point, normal, tool) => {
      // Water splashes off; soap and scrubbing just fizz a few small bubbles.
      const rinse = tool === "rinse"
      const count = rinse ? 6 : 2
      for (let i = 0; i < count; i++) {
        if (particles.current.length >= PARTICLES) particles.current.shift()
        const spread = rinse
          ? new THREE.Vector3((Math.random() - 0.5) * 1.4, Math.random() * 0.8, (Math.random() - 0.5) * 1.4)
          : new THREE.Vector3((Math.random() - 0.5) * 0.3, Math.random() * 0.2, (Math.random() - 0.5) * 0.3)
        particles.current.push({
          position: point.clone().addScaledVector(normal, 0.04),
          velocity: normal.clone().multiplyScalar(rinse ? 1.6 : 0.15).add(spread),
          life: rinse ? 0.9 : 0.6,
          foam: !rinse
        })
      }
    }
  }, [emitRef])

  useFrame((_, delta) => {
    let w = 0
    let f = 0
    // Drop spent particles in place (no new array every frame).
    const list = particles.current
    let alive = 0
    for (const particle of list) if ((particle.life -= delta) > 0) list[alive++] = particle
    list.length = alive
    for (const particle of particles.current) {
      particle.velocity.y -= (particle.foam ? 0.4 : 9.8) * delta
      particle.position.addScaledVector(particle.velocity, delta)
      if (particle.position.y < 0.02) {
        particle.position.y = 0.02
        particle.velocity.set(0, 0, 0)
      }
      dummy.position.copy(particle.position)
      dummy.scale.setScalar(particle.foam ? 0.015 + particle.life * 0.02 : 0.025)
      dummy.updateMatrix()
      if (particle.foam && foam.current) foam.current.setMatrixAt(f++, dummy.matrix)
      if (!particle.foam && water.current) water.current.setMatrixAt(w++, dummy.matrix)
    }
    if (water.current) {
      water.current.count = w
      water.current.instanceMatrix.needsUpdate = true
    }
    if (foam.current) {
      foam.current.count = f
      foam.current.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      <instancedMesh ref={water} args={[undefined, undefined, PARTICLES]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 6]} />
        <meshStandardMaterial color="#7dd3fc" transparent opacity={0.75} roughness={0.1} />
      </instancedMesh>
      <instancedMesh ref={foam} args={[undefined, undefined, PARTICLES]} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.9} />
      </instancedMesh>
    </>
  )
}

// ---------------------------------------------------------------------------
// The car.

function Zone({
  panel,
  layers,
  state,
  onWork
}: {
  panel: ZonePanel
  layers: ZoneLayers
  state: BayZone | undefined
  onWork(panel: ZonePanel, event: ThreeEvent<PointerEvent>, start: boolean): void
}) {
  // The server's numbers decide how much mud and foam really remain.
  const dirtOpacity = state ? (state.clean ? 0 : Math.min(1, 0.25 + state.dirt * 0.85)) : 1
  const foamOpacity = state ? (state.clean ? 0 : Math.min(1, state.soap * 1.6)) : 0
  return (
    <group position={panel.position} rotation={panel.rotation}>
      <mesh
        onPointerDown={(event) => onWork(panel, event, true)}
        onPointerMove={(event) => onWork(panel, event, false)}
      >
        <planeGeometry args={panel.size} />
        <meshStandardMaterial map={layers.dirtTex} transparent opacity={dirtOpacity} depthWrite={false} roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.003]} raycast={() => null}>
        <planeGeometry args={panel.size} />
        <meshStandardMaterial map={layers.foamTex} transparent opacity={foamOpacity} depthWrite={false} roughness={0.8} />
      </mesh>
      {state?.clean && (
        <mesh position={[0, 0, 0.004]} raycast={() => null}>
          <planeGeometry args={panel.size} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.06} metalness={0.6} roughness={0.05} />
        </mesh>
      )}
    </group>
  )
}

function CarBody({ layout }: { layout: CarLayout }) {
  const { length, width, lowerBottom, lowerTop, cabin, wheelRadius, paint, stripe } = layout
  const paintMat = { color: paint, metalness: 0.4, roughness: 0.35 }
  const glass = { color: "#0f172a", metalness: 0.6, roughness: 0.1 }
  const cabinWidth = width - cabin.inset * 2
  const cabinLength = cabin.zEnd - cabin.zStart
  const cabinHeight = cabin.top - lowerTop
  return (
    <group>
      <mesh position={[0, (lowerTop + lowerBottom) / 2, 0]} castShadow>
        <boxGeometry args={[width, lowerTop - lowerBottom, length]} />
        <meshStandardMaterial {...paintMat} />
      </mesh>
      {/* Cabin with windows */}
      <mesh position={[0, lowerTop + cabinHeight / 2, (cabin.zStart + cabin.zEnd) / 2]} castShadow>
        <boxGeometry args={[cabinWidth, cabinHeight, cabinLength]} />
        <meshStandardMaterial {...paintMat} />
      </mesh>
      {[1, -1].map((side) => (
        <mesh key={side} position={[side * (cabinWidth / 2 + 0.004), lowerTop + cabinHeight * 0.55, (cabin.zStart + cabin.zEnd) / 2]} rotation={[0, side * (Math.PI / 2), 0]}>
          <planeGeometry args={[cabinLength * 0.86, cabinHeight * 0.62]} />
          <meshStandardMaterial {...glass} />
        </mesh>
      ))}
      <mesh position={[0, lowerTop + cabinHeight * 0.52, cabin.zEnd + 0.004]}>
        <planeGeometry args={[cabinWidth * 0.86, cabinHeight * 0.7]} />
        <meshStandardMaterial {...glass} />
      </mesh>
      <mesh position={[0, lowerTop + cabinHeight * 0.52, cabin.zStart - 0.004]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[cabinWidth * 0.8, cabinHeight * 0.6]} />
        <meshStandardMaterial {...glass} />
      </mesh>
      {stripe &&
        [1, -1].map((side) => (
          <mesh key={side} position={[side * (width / 2 + 0.003), lowerTop - 0.18, 0]} rotation={[0, side * (Math.PI / 2), 0]}>
            <planeGeometry args={[length * 0.96, 0.14]} />
            <meshStandardMaterial color={stripe} />
          </mesh>
        ))}
      {/* Lights */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * (width / 2 - 0.25), lowerTop - 0.15, length / 2 + 0.01]}>
            <boxGeometry args={[0.32, 0.12, 0.02]} />
            <meshStandardMaterial color="#fef9c3" emissive="#fde68a" emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[side * (width / 2 - 0.22), lowerTop - 0.15, -length / 2 - 0.01]}>
            <boxGeometry args={[0.28, 0.1, 0.02]} />
            <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
      {/* Wheels */}
      {[1, -1].flatMap((x) =>
        [1, -1].map((z) => (
          <group key={`${x}${z}`} position={[x * (width / 2 - 0.05), wheelRadius, z * (length / 2 - 0.8)]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[wheelRadius, wheelRadius, 0.24, 20]} />
              <meshStandardMaterial color="#111111" roughness={0.9} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]} position={[x * 0.125, 0, 0]}>
              <cylinderGeometry args={[wheelRadius * 0.55, wheelRadius * 0.55, 0.01, 16]} />
              <meshStandardMaterial color="#9ca3af" metalness={0.8} roughness={0.3} />
            </mesh>
          </group>
        ))
      )}
    </group>
  )
}

function Bay() {
  return (
    <group>
      {/* Wet concrete with a drain */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[22, 22]} />
        <meshStandardMaterial color="#3f4652" roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.4, 0.005, 0]}>
        <planeGeometry args={[0.25, 7]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* Bucket and hose reel */}
      <group position={[-3.2, 0, -2.2]}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.18, 0.44, 16]} />
          <meshStandardMaterial color="#f59e0b" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.42, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.2, 16]} />
          <meshStandardMaterial color="#e0f2fe" />
        </mesh>
      </group>
      <mesh position={[3.6, 0.06, -4.2]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.4, 0.06, 8, 24]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
    </group>
  )
}

/** Your avatar works beside the car, on the side the camera is looking from. */
function Worker({ loadout, layout }: { loadout: AvatarLoadout; layout: CarLayout | null }) {
  const group = useRef<THREE.Group>(null)
  const { camera } = useThree()
  useFrame(() => {
    if (!group.current) return
    const angle = Math.atan2(camera.position.x, camera.position.z) + Math.PI / 2.6
    const radius = (layout ? Math.max(layout.width, layout.length) / 2 : 2) + 0.9
    group.current.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius)
    group.current.rotation.y = angle + Math.PI
  })
  return (
    <group ref={group}>
      <RealisticAvatar loadout={loadout} moving={false} />
    </group>
  )
}

/**
 * The camera walks around the car in 45° steps (buttons only), at a raised
 * angle so the roof is reachable. Dragging never moves it: every drag washes.
 */
function CameraRig({ step, showcase }: { step: number; showcase?: boolean }) {
  const { camera, size } = useThree()
  const angle = useRef(step * (Math.PI / 4))
  // On a tall phone screen, widen the lens and step back so the whole car fits.
  const aspect = size.width / Math.max(1, size.height)
  const radius = (aspect < 1 ? 7.4 * Math.min(1.5, 0.9 / aspect) : 7.4) * (showcase && aspect >= 1 ? 1.3 : 1)
  useEffect(() => {
    const lens = camera as THREE.PerspectiveCamera
    lens.fov = aspect < 1 ? 60 : 42
    // The start screen's card covers the bottom (phones) or the right (wide
    // screens), so slide the view to keep the car in the open part.
    if (showcase) {
      if (aspect < 1) lens.setViewOffset(size.width, size.height, 0, -size.height * 0.26, size.width, size.height)
      else lens.setViewOffset(size.width, size.height, size.width * 0.16, 0, size.width, size.height)
    } else lens.clearViewOffset()
    lens.updateProjectionMatrix()
  }, [camera, aspect, showcase, size.width, size.height])
  const wasShowcase = useRef(showcase)
  useFrame((_, delta) => {
    if (showcase) angle.current += delta * 0.12
    else {
      const target = step * (Math.PI / 4)
      // Leaving the start screen's slow spin (same canvas): take the short way
      // round to the working view instead of unwinding every turn.
      if (wasShowcase.current) angle.current = target + THREE.MathUtils.euclideanModulo(angle.current - target + Math.PI, Math.PI * 2) - Math.PI
      angle.current += (target - angle.current) * Math.min(1, delta * 5)
    }
    camera.position.set(Math.sin(angle.current) * radius, 3.8 + (radius - 7.4) * 0.3, Math.cos(angle.current) * radius)
    camera.lookAt(0, 0.9, 0)
    wasShowcase.current = showcase
  })
  return null
}

function Scene({
  carId,
  carType,
  zones,
  tool,
  loadout,
  step,
  showcase,
  onWash
}: {
  carId: string | null
  carType: string | null
  zones: BayZone[]
  tool: WashTool
  loadout: AvatarLoadout
  step: number
  showcase?: boolean
  onWash(zone: number, tool: WashTool): void
}) {
  const layout = useMemo(() => (carType && carId ? carLayout(carType, carId) : null), [carType, carId])
  const layers = useMemo(() => {
    if (!layout || typeof document === "undefined") return [] as ZoneLayers[]
    return layout.zones.map((zone) => makeLayers(zone.id + 1 + Number(carId ?? 0) * 7))
  }, [layout, carId])
  useEffect(
    () => () => {
      for (const layer of layers) {
        layer.dirtTex.dispose()
        layer.foamTex.dispose()
      }
    },
    [layers]
  )

  // Wipe a zone's canvases once the server says it's clean.
  useEffect(() => {
    zones.forEach((zone, index) => {
      const layer = layers[index]
      if (!layer || !zone.clean || layer.wiped) return
      layer.wiped = true
      layer.dirt.getContext("2d")!.clearRect(0, 0, TEX, TEX)
      layer.foam.getContext("2d")!.clearRect(0, 0, TEX, TEX)
      layer.dirtTex.needsUpdate = true
      layer.foamTex.needsUpdate = true
    })
  }, [zones, layers])

  // The car rolls in.
  const carGroup = useRef<THREE.Group>(null)
  const arrivedAt = useRef(0)
  useEffect(() => {
    arrivedAt.current = performance.now()
  }, [carId])
  useFrame(() => {
    if (!carGroup.current) return
    // On the start screen the car is already parked.
    const t = showcase ? 1 : Math.min(1, (performance.now() - arrivedAt.current) / 1200)
    carGroup.current.position.z = -9 * (1 - t) * (1 - t)
  })

  const working = useRef(false)
  const lastSent = useRef(new Map<string, number>())
  const emitRef = useRef<((point: THREE.Vector3, normal: THREE.Vector3, tool: WashTool) => void) | null>(null)
  const cursor = useRef<THREE.Mesh>(null)

  useEffect(() => {
    const stop = () => {
      working.current = false
    }
    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    return () => {
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
    }
  }, [])

  const onWork = (panel: ZonePanel, event: ThreeEvent<PointerEvent>, start: boolean) => {
    if (showcase) return
    if (cursor.current) {
      cursor.current.position.copy(event.point)
      cursor.current.visible = true
    }
    if (start) {
      event.stopPropagation()
      working.current = true
    }
    if (!working.current || !event.uv) return
    event.stopPropagation()
    const layer = layers[panel.id]
    const zone = zones[panel.id]
    if (!layer || zone?.clean) return
    const normal = event.face?.normal.clone().transformDirection(event.object.matrixWorld) ?? new THREE.Vector3(0, 1, 0)
    if (tool === "soap") {
      brush(layer.foam, event.uv, 22, "foam")
      layer.foamTex.needsUpdate = true
    } else if (tool === "scrub") {
      // Mud comes off where there's soap; dry scrubbing barely does anything.
      brush(layer.dirt, event.uv, (zone?.soap ?? 0) >= 0.25 ? 16 : 4, "erase")
      layer.dirtTex.needsUpdate = true
    } else {
      brush(layer.foam, event.uv, 20, "erase")
      layer.foamTex.needsUpdate = true
    }
    emitRef.current?.(event.point, normal, tool)
    const key = `${panel.id}:${tool}`
    const now = performance.now()
    if (now - (lastSent.current.get(key) ?? 0) >= SEND_EVERY_MS) {
      lastSent.current.set(key, now)
      onWash(panel.id, tool)
    }
  }

  return (
    <>
      <hemisphereLight args={["#fff4d6", "#334155", 0.9]} />
      <directionalLight position={[5, 9, 6]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, 4, -3]} intensity={0.6} color="#bcd3ff" />
      <Bay />
      {layout && (
        <group ref={carGroup}>
          <CarBody layout={layout} />
          {layout.zones.map((panel, index) => (
            <Zone key={panel.id} panel={panel} layers={layers[index]!} state={zones[index]} onWork={onWork} />
          ))}
        </group>
      )}
      <mesh ref={cursor} visible={false} raycast={() => null}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshBasicMaterial color={tool === "soap" ? "#ffffff" : tool === "scrub" ? "#facc15" : "#38bdf8"} transparent opacity={0.8} />
      </mesh>
      <Spray emitRef={emitRef} />
      <Worker loadout={loadout} layout={layout} />
      <CameraRig step={step} showcase={showcase} />
    </>
  )
}

/** The washing bay: drag on the car to work, drag the background to walk around. */
export const CarWashBay = memo(function CarWashBay(props: {
  carId: string | null
  carType: string | null
  zones: BayZone[]
  tool: WashTool
  loadout: AvatarLoadout
  /** A slowly turning, hands-off view for the start screen. */
  showcase?: boolean
  onWash(zone: number, tool: WashTool): void
}) {
  // Camera position around the car, in 45° steps (front-left to start).
  const [step, setStep] = useState(1)
  // Lighter on low-end / slow phones (no shadows, 1× pixels): lib/deviceTier.ts
  const quality = sceneQuality()
  return (
    <div className={`absolute inset-0 ${props.showcase ? "pointer-events-none" : ""}`}>
      <Canvas
        shadows={quality.shadows}
        camera={{ position: [5.2, 3.2, 5.6], fov: 42 }}
        gl={{ antialias: quality.antialias }}
        dpr={quality.dpr}
        style={{ touchAction: "none" }}
      >
        <color attach="background" args={["#0f172a"]} />
        <fog attach="fog" args={["#0f172a", 14, 26]} />
        <Scene {...props} step={step} />
      </Canvas>
      {!props.showcase && (
      <div className="pointer-events-none absolute inset-x-0 bottom-[7.5rem] flex justify-between px-3">
        <button
          type="button"
          onClick={() => setStep((value) => value - 1)}
          aria-label="Walk left around the car"
          className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-slate-950/80 text-xl font-black text-white"
        >
          ↺
        </button>
        <button
          type="button"
          onClick={() => setStep((value) => value + 1)}
          aria-label="Walk right around the car"
          className="pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-slate-950/80 text-xl font-black text-white"
        >
          ↻
        </button>
      </div>
      )}
    </div>
  )
})
