"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { LatLng } from "@tiral/game-core"
import { lngLatToMercator } from "@tiral/map"

type Avatar3DProps = {
  latLng: LatLng
  heading?: number
  moving?: boolean
  color?: string
  accentColor?: string
  smooth?: boolean
}

function GroundMarker({ color }: { color: string }) {
  const ringRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!ringRef.current) return
    const pulse = 1 + Math.sin(clock.elapsedTime * 3) * 0.08
    ringRef.current.scale.setScalar(pulse)
  })

  return (
    <group position={[0, 0, 0.01]}>
      <mesh ref={ringRef}>
        <ringGeometry args={[0.7, 0.92, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.85} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.58, 40]} />
        <meshBasicMaterial color="#111827" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Adventurer({ color, accentColor, moving }: { color: string; accentColor: string; moving: boolean }) {
  const bodyRef = useRef<THREE.Group>(null)
  const leftArmRef = useRef<THREE.Mesh>(null)
  const rightArmRef = useRef<THREE.Mesh>(null)
  const leftLegRef = useRef<THREE.Mesh>(null)
  const rightLegRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const stride = moving ? Math.sin(t * 8) * 0.55 : 0
    if (bodyRef.current) {
      bodyRef.current.position.y = moving ? 0.04 + Math.abs(Math.sin(t * 8)) * 0.05 : 0.04
    }
    if (leftArmRef.current) leftArmRef.current.rotation.x = stride
    if (rightArmRef.current) rightArmRef.current.rotation.x = -stride
    if (leftLegRef.current) leftLegRef.current.rotation.x = -stride * 0.65
    if (rightLegRef.current) rightLegRef.current.rotation.x = stride * 0.65
  })

  const skin = "#f2bd8c"

  return (
    <group ref={bodyRef}>
      <mesh ref={leftLegRef} position={[-0.14, 0.35, 0]} castShadow>
        <capsuleGeometry args={[0.1, 0.42, 5, 12]} />
        <meshStandardMaterial color="#27364d" roughness={0.75} />
      </mesh>
      <mesh ref={rightLegRef} position={[0.14, 0.35, 0]} castShadow>
        <capsuleGeometry args={[0.1, 0.42, 5, 12]} />
        <meshStandardMaterial color="#27364d" roughness={0.75} />
      </mesh>

      <mesh position={[0, 0.94, 0]} castShadow>
        <capsuleGeometry args={[0.27, 0.42, 6, 16]} />
        <meshStandardMaterial color={color} roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.98, -0.29]} castShadow>
        <boxGeometry args={[0.42, 0.52, 0.2]} />
        <meshStandardMaterial color={accentColor} roughness={0.72} />
      </mesh>

      <mesh ref={leftArmRef} position={[-0.39, 0.98, 0]} rotation={[0, 0, 0.2]} castShadow>
        <capsuleGeometry args={[0.08, 0.42, 5, 10]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>
      <mesh ref={rightArmRef} position={[0.39, 0.98, 0]} rotation={[0, 0, -0.2]} castShadow>
        <capsuleGeometry args={[0.08, 0.42, 5, 10]} />
        <meshStandardMaterial color={color} roughness={0.62} />
      </mesh>

      <mesh position={[0, 1.53, 0]} castShadow>
        <sphereGeometry args={[0.25, 24, 24]} />
        <meshStandardMaterial color={skin} roughness={0.52} />
      </mesh>
      <mesh position={[-0.09, 1.56, 0.23]}>
        <sphereGeometry args={[0.03, 10, 10]} />
        <meshStandardMaterial color="#172033" roughness={0.35} />
      </mesh>
      <mesh position={[0.09, 1.56, 0.23]}>
        <sphereGeometry args={[0.03, 10, 10]} />
        <meshStandardMaterial color="#172033" roughness={0.35} />
      </mesh>

      <mesh position={[0, 1.72, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.3, 0.14, 20]} />
        <meshStandardMaterial color={accentColor} roughness={0.68} />
      </mesh>
      <mesh position={[0, 1.68, 0.25]} castShadow>
        <boxGeometry args={[0.4, 0.04, 0.25]} />
        <meshStandardMaterial color={accentColor} roughness={0.68} />
      </mesh>
    </group>
  )
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
  accentColor = "#92400e",
  smooth = false
}: Avatar3DProps) {
  const groupRef = useRef<THREE.Group>(null)
  const displayRef = useRef<{ x: number; y: number } | null>(null)
  const mercator = useMemo(() => lngLatToMercator(latLng), [latLng.lat, latLng.lng])

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
    groupRef.current.position.set(displayRef.current.x, displayRef.current.y, 0)
    groupRef.current.rotation.z = dampAngle(groupRef.current.rotation.z, heading, 0.18)
  })

  return (
    <group ref={groupRef} scale={0.00000045}>
      <GroundMarker color={color} />
      <group rotation={[Math.PI / 2, 0, 0]}>
        <Adventurer color={color} accentColor={accentColor} moving={moving} />
      </group>
    </group>
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
    groupRef.current.position.set(mercator.x, mercator.y, 0)
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
    <group ref={groupRef} scale={0.00000052}>
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
