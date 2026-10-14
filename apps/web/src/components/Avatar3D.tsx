"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import type { LatLng } from "@tiral/game-core"
import { lngLatToMercator } from "@tiral/map"
import {
  DEFAULT_LOADOUT,
  RARITY_COLORS,
  loadoutRarity,
  resolveLoadout,
  type AvatarLoadout,
  type Rarity,
  type Trail
} from "@tiral/avatars"
import { RealisticAvatar } from "./RealisticAvatar"
import { BikeRider } from "./bike/BikeRider"
import type { BikeLook } from "@tiral/game-core"

/** Wheel spin while riding (m/s, visual only). */
const BIKE_WHEEL_SPEED = 9
import { useMapOrigin } from "./ThreeLayer"

type Avatar3DProps = {
  latLng: LatLng
  heading?: number
  moving?: boolean
  color?: string
  loadout?: AvatarLoadout
  smooth?: boolean
  /** Shown in the tag above the head. */
  name?: string
  isSelf?: boolean
  /** Set once this racer has finished; they celebrate while standing. */
  finishPosition?: number | null
  /** Down after sprinting on empty (Banange!). */
  collapsed?: boolean
  /** Riding a boda (hustles): the bike, and an optional passenger on the back. */
  bike?: { look: BikeLook; passenger?: boolean; passengerSeed?: string; plateSeed?: string } | null
}

// Model units (≈ metres in the avatar rig) → mercator units. Avatars are drawn
// larger than life so they read on the map. Zoomed in, 1 unit ≈ 12 m (a runner
// is ~22 m tall, stride inside a Kampala road); zoomed out they grow so they
// never drop below MIN_AVATAR_PX tall on screen.
const AVATAR_SCALE = 0.0000003
const AVATAR_HEIGHT = 1.85
const MIN_AVATAR_PX = 34

/** Mercator units per model unit at the current map zoom. */
function avatarScale(worldSize: number) {
  return Math.max(AVATAR_SCALE, MIN_AVATAR_PX / (worldSize * AVATAR_HEIGHT))
}

function GroundMarker({ color, rarity }: { color: string; rarity: Rarity }) {
  const ringRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (ringRef.current) ringRef.current.scale.setScalar(1 + Math.sin(t * 3) * 0.08)
    if (glowRef.current) glowRef.current.rotation.z = t * 0.8
    if (glowMaterialRef.current) glowMaterialRef.current.opacity = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2.2))
  })

  return (
    <group position={[0, 0, 0.01]}>
      {rarity !== "common" && (
        // Rarity aura: dashed ring in the rarity colour, slowly spinning.
        <mesh ref={glowRef}>
          <ringGeometry args={[0.6, rarity === "legendary" ? 0.8 : 0.72, 48, 1, 0, Math.PI * 2]} />
          <meshBasicMaterial
            ref={glowMaterialRef}
            color={RARITY_COLORS[rarity]}
            transparent
            opacity={0.5}
            side={THREE.DoubleSide}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      <mesh ref={ringRef}>
        <ringGeometry args={[0.42, 0.55, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.38, 40]} />
        <meshBasicMaterial color="#111827" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  )
}

const TRAIL_SIZE = 56
const FLAG_COLORS = ["#111827", "#facc15", "#dc2626"]
const FIRE_STOPS = [new THREE.Color("#fde047"), new THREE.Color("#f97316"), new THREE.Color("#b91c1c")]

type TrailParticle = { x: number; y: number; z: number; vz: number; drift: number; age: number; life: number; seed: number }

/**
 * Particles left behind on the road while running. Particles live in world
 * (mercator) space; the mesh is re-anchored on the avatar every frame and
 * instances are written relative to it, which keeps float precision.
 */
function TrailEffect({
  kind,
  moving,
  anchorRef
}: {
  kind: Exclude<Trail, "none">
  moving: boolean
  anchorRef: React.RefObject<{ x: number; y: number } | null>
}) {
  const groupRef = useRef<THREE.Group>(null)
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const origin = useMapOrigin()
  const state = useMemo(
    () => ({ particles: [] as TrailParticle[], spawnClock: 0, count: 0, matrix: new THREE.Matrix4(), color: new THREE.Color() }),
    []
  )
  const geometry = useMemo(
    () => (kind === "flag" ? new THREE.BoxGeometry(1, 1, 0.25) : new THREE.IcosahedronGeometry(1, kind === "dust" ? 1 : 0)),
    [kind]
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => {
    // Per-instance colours must exist before the material first compiles.
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TRAIL_SIZE * 3), 3)
    mesh.count = 0
    ;(mesh.material as THREE.Material).needsUpdate = true
  }, [geometry])

  useFrame((_, delta) => {
    const anchor = anchorRef.current
    const group = groupRef.current
    const mesh = meshRef.current
    if (!anchor || !group || !mesh) return
    const dt = Math.min(delta, 0.1)
    const scale = avatarScale(origin.current.worldSize)
    group.position.set(anchor.x - origin.current.x, anchor.y - origin.current.y, 0)
    group.scale.setScalar(scale)

    state.spawnClock += dt
    const interval = kind === "flag" ? 0.07 : kind === "sparks" ? 0.03 : 0.045
    if (moving && state.spawnClock >= interval) {
      state.spawnClock = 0
      const seed = state.count++
      const jitter = () => (Math.random() - 0.5) * 0.5 * scale
      const p: TrailParticle = {
        x: anchor.x + jitter(),
        y: anchor.y + jitter(),
        z: kind === "flag" ? 0.9 : kind === "dust" ? 0.1 : 0.3,
        vz: kind === "sparks" ? 1.2 + Math.random() * 1.4 : kind === "fire" ? 0.9 : kind === "dust" ? 0.25 : 0,
        drift: (Math.random() - 0.5) * 0.6,
        age: 0,
        life: kind === "flag" ? 1.3 : kind === "dust" ? 0.9 : kind === "sparks" ? 0.6 : 0.7,
        seed
      }
      if (state.particles.length >= TRAIL_SIZE) state.particles.shift()
      state.particles.push(p)
    }

    let visible = 0
    for (const p of state.particles) {
      p.age += dt
      if (p.age >= p.life) continue
      const k = p.age / p.life
      p.z += p.vz * dt
      let size: number
      if (kind === "dust") {
        size = 0.18 + k * 0.4
        state.color.set("#d6b98c")
      } else if (kind === "sparks") {
        size = 0.09 * (1 - k)
        state.color.set(p.seed % 3 === 0 ? "#ffffff" : "#fde047")
      } else if (kind === "fire") {
        size = 0.32 * (1 - k * 0.85)
        const stop = Math.min(1.999, k * 2)
        state.color.copy(FIRE_STOPS[Math.floor(stop)]!).lerp(FIRE_STOPS[Math.floor(stop) + 1]!, stop % 1)
      } else {
        size = 0.26 * (1 - k * k)
        state.color.set(FLAG_COLORS[Math.floor(p.seed / 2) % 3]!)
      }
      const lx = (p.x - anchor.x) / scale + p.drift * k
      const ly = (p.y - anchor.y) / scale
      state.matrix.makeScale(size, size, size).setPosition(lx, ly, p.z)
      mesh.setMatrixAt(visible, state.matrix)
      mesh.setColorAt(visible, state.color)
      visible++
    }
    mesh.count = visible
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <group ref={groupRef}>
      <instancedMesh ref={meshRef} args={[geometry, undefined, TRAIL_SIZE]} frustumCulled={false}>
        <meshBasicMaterial toneMapped={false} transparent opacity={kind === "dust" ? 0.55 : 0.95} depthWrite={false} />
      </instancedMesh>
    </group>
  )
}

const MEDALS = ["🥇", "🥈", "🥉"]

/**
 * DOM tag pinned above the head. drei's <Html> can't be used here: the map
 * camera lives entirely in the projection matrix, so its "behind camera" test
 * hides everything. We project the head point with that same matrix instead.
 */
function NameTag({
  name,
  isSelf,
  finishPosition,
  rarity
}: {
  name: string
  isSelf: boolean
  finishPosition: number | null
  rarity: Rarity
}) {
  const anchorRef = useRef<THREE.Group>(null)
  const { gl, camera, size } = useThree()
  const el = useMemo(() => document.createElement("div"), [])
  const point = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const host = gl.domElement.parentElement
    if (!host) return
    el.style.position = "absolute"
    el.style.left = "0"
    el.style.top = "0"
    el.style.pointerEvents = "none"
    el.style.zIndex = isSelf ? "2" : "1"
    host.appendChild(el)
    return () => el.remove()
  }, [el, gl, isSelf])

  const place = finishPosition === null ? null : (MEDALS[finishPosition - 1] ?? `#${finishPosition}`)
  useEffect(() => {
    el.innerHTML = ""
    const tag = document.createElement("div")
    tag.className = "tiral-nametag"
    if (isSelf) tag.dataset.self = "true"
    if (rarity !== "common") tag.style.borderColor = RARITY_COLORS[rarity]
    if (place) {
      const medal = document.createElement("span")
      medal.className = "tiral-nametag__place"
      medal.textContent = place
      tag.appendChild(medal)
    }
    const label = document.createElement("span")
    label.className = "tiral-nametag__name"
    label.textContent = isSelf ? "You" : name
    tag.appendChild(label)
    el.appendChild(tag)
  }, [el, name, isSelf, place, rarity])

  useFrame(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    anchor.getWorldPosition(point)
    point.applyMatrix4(camera.projectionMatrix)
    const visible = point.z > -1 && point.z < 1
    el.style.display = visible ? "" : "none"
    if (!visible) return
    const x = (point.x * 0.5 + 0.5) * size.width
    const y = (-point.y * 0.5 + 0.5) * size.height
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
  })

  return <group ref={anchorRef} position={[0, 0, 2.3]} />
}

function dampAngle(current: number, target: number, smoothing: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * smoothing
}

export function Avatar3D({
  latLng,
  heading = 0,
  moving = false,
  color = "#f59e0b",
  loadout = DEFAULT_LOADOUT,
  smooth = false,
  name,
  isSelf = false,
  finishPosition = null,
  collapsed = false,
  bike = null
}: Avatar3DProps) {
  const groupRef = useRef<THREE.Group>(null)
  const displayRef = useRef<{ x: number; y: number } | null>(null)
  const origin = useMapOrigin()
  const mercator = useMemo(() => lngLatToMercator(latLng), [latLng.lat, latLng.lng])
  const resolved = resolveLoadout(loadout)
  const rarity = loadoutRarity(loadout)
  const celebrating = finishPosition !== null && !moving

  useFrame(() => {
    if (!groupRef.current) return
    if (!smooth) {
      displayRef.current = { x: mercator.x, y: mercator.y }
    } else if (!displayRef.current) {
      displayRef.current = { x: mercator.x, y: mercator.y }
    } else {
      const blend = 0.16
      displayRef.current = {
        x: displayRef.current.x + (mercator.x - displayRef.current.x) * blend,
        y: displayRef.current.y + (mercator.y - displayRef.current.y) * blend
      }
    }
    groupRef.current.position.set(displayRef.current.x - origin.current.x, displayRef.current.y - origin.current.y, 0)
    groupRef.current.scale.setScalar(avatarScale(origin.current.worldSize))
    groupRef.current.rotation.z = dampAngle(groupRef.current.rotation.z, heading, 0.18)
  })

  return (
    <>
      {resolved.trail !== "none" && <TrailEffect kind={resolved.trail} moving={moving} anchorRef={displayRef} />}
      <group ref={groupRef} scale={AVATAR_SCALE}>
        <GroundMarker color={color} rarity={rarity} />
        {/* The map projection flips y, which reverses triangle winding; mirroring
            the model makes three.js flip front faces back so meshes aren't
            drawn inside-out. */}
        <group rotation={[Math.PI / 2, 0, 0]} scale={[-1, 1, 1]}>
          {bike ? (
            <BikeRider
              look={bike.look}
              rider={loadout}
              passenger={bike.passenger ?? false}
              passengerSeed={bike.passengerSeed}
              speed={moving ? BIKE_WHEEL_SPEED : 0}
              plateSeed={bike.plateSeed}
              mirroredText
            />
          ) : (
            <RealisticAvatar
              loadout={loadout}
              moving={moving}
              pose={celebrating ? "dance" : "auto"}
              gait="run"
              act={collapsed ? "collapse" : undefined}
            />
          )}
        </group>
        {(name || isSelf) && (
          <NameTag name={name ?? ""} isSelf={isSelf} finishPosition={finishPosition} rarity={rarity} />
        )}
      </group>
    </>
  )
}

const SPARKLE_COUNT = 12

export function TreasureBeacon({ latLng }: { latLng: LatLng }) {
  const groupRef = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.PointLight>(null)
  const lidRef = useRef<THREE.MeshStandardMaterial>(null)
  const beamRef = useRef<THREE.MeshBasicMaterial>(null)
  const rippleARef = useRef<THREE.Mesh>(null)
  const rippleBRef = useRef<THREE.Mesh>(null)
  const sparklesRef = useRef<THREE.Group>(null)
  const origin = useMapOrigin()
  const mercator = useMemo(() => lngLatToMercator(latLng), [latLng.lat, latLng.lng])
  const sparkles = useMemo(
    () =>
      Array.from({ length: SPARKLE_COUNT }, (_, index) => ({
        radius: 0.9 + ((index * 37) % 10) / 10 * 0.9,
        speed: 0.5 + ((index * 53) % 10) / 10 * 0.7,
        offset: (index / SPARKLE_COUNT) * Math.PI * 2,
        height: 0.7 + ((index * 29) % 10) / 10 * 1.8,
        size: 0.045 + ((index * 17) % 10) / 10 * 0.05
      })),
    []
  )

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.position.set(mercator.x - origin.current.x, mercator.y - origin.current.y, 0)
    groupRef.current.scale.setScalar(avatarScale(origin.current.worldSize) * 1.15)
    const t = clock.elapsedTime
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4)

    if (lightRef.current) lightRef.current.intensity = 2.2 + pulse * 2.4
    if (lidRef.current) lidRef.current.emissiveIntensity = 0.9 + pulse * 1.2
    if (beamRef.current) beamRef.current.opacity = 0.16 + pulse * 0.14

    for (const [ripple, phase] of [[rippleARef, 0], [rippleBRef, 0.5]] as const) {
      const mesh = ripple.current
      if (!mesh) continue
      const progress = (t * 0.45 + phase) % 1
      mesh.scale.setScalar(0.7 + progress * 1.6)
      const material = mesh.material as THREE.MeshBasicMaterial
      material.opacity = 0.65 * (1 - progress)
    }

    if (sparklesRef.current) {
      sparklesRef.current.children.forEach((child, index) => {
        const sparkle = sparkles[index]!
        const angle = sparkle.offset + t * sparkle.speed
        child.position.set(
          Math.cos(angle) * sparkle.radius,
          Math.sin(angle) * sparkle.radius,
          sparkle.height + Math.sin(t * 1.8 + sparkle.offset) * 0.25
        )
        const twinkle = 0.55 + 0.45 * Math.sin(t * 3.2 + sparkle.offset * 3)
        child.scale.setScalar(twinkle)
      })
    }
  })

  return (
    <group ref={groupRef} scale={AVATAR_SCALE * 1.15}>
      <pointLight ref={lightRef} position={[0, 0, 2.4]} color="#ffd76a" intensity={3} distance={0} decay={0} />

      <mesh position={[0, 0, 0.02]}>
        <ringGeometry args={[0.8, 1.06, 48]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.9} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={rippleARef} position={[0, 0, 0.03]}>
        <ringGeometry args={[0.8, 0.92, 48]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh ref={rippleBRef} position={[0, 0, 0.03]}>
        <ringGeometry args={[0.8, 0.92, 48]} />
        <meshBasicMaterial color="#fde68a" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.7, 40]} />
        <meshBasicMaterial color="#b45309" transparent opacity={0.4} depthWrite={false} />
      </mesh>

      <mesh position={[0, 0, 3.2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.62, 6.4, 20, 1, true]} />
        <meshBasicMaterial
          ref={beamRef}
          color="#fcd34d"
          transparent
          opacity={0.22}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <group>
        <mesh position={[0, 0, 0.48]} castShadow>
          <boxGeometry args={[0.82, 0.56, 0.48]} />
          <meshStandardMaterial color="#8b5a2b" roughness={0.62} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0, 0.77]} castShadow>
          <boxGeometry args={[0.86, 0.6, 0.12]} />
          <meshStandardMaterial
            ref={lidRef}
            color="#facc15"
            roughness={0.25}
            metalness={0.55}
            emissive="#f59e0b"
            emissiveIntensity={1.4}
          />
        </mesh>
        <mesh position={[0, 0, 0.48]}>
          <boxGeometry args={[0.86, 0.1, 0.5]} />
          <meshStandardMaterial
            color="#fde68a"
            roughness={0.3}
            metalness={0.4}
            emissive="#fbbf24"
            emissiveIntensity={1}
          />
        </mesh>
      </group>

      <group ref={sparklesRef}>
        {sparkles.map((sparkle, index) => (
          <mesh key={index}>
            <sphereGeometry args={[sparkle.size, 8, 8]} />
            <meshBasicMaterial color="#fef3c7" transparent opacity={0.95} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
