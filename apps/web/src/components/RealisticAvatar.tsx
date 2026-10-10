"use client"

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { AvatarLoadout, HatStyle } from "@tiral/avatars"

const HAIR_COLOR = "#2b2118"
const SHOE_COLOR = "#26211c"
const SOLE_COLOR = "#0f0d0b"

function RealisticHat({ style, color }: { style: HatStyle; color: string }) {
  if (style === "none") return null
  if (style === "beanie") {
    return (
      <group>
        <mesh position={[0, 0.13, -0.01]} scale={[1, 0.8, 1]} castShadow>
          <sphereGeometry args={[0.235, 20, 20]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.215, 0.06, 10, 24]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.3, -0.01]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
      </group>
    )
  }
  if (style === "safari") {
    return (
      <group>
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.19, 0.16, 16]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.11, 0]} castShadow>
          <cylinderGeometry args={[0.36, 0.36, 0.035, 24]} />
          <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
      </group>
    )
  }
  return (
    <group>
      <mesh position={[0, 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.225, 0.235, 0.13, 20]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.12, 0.27]} castShadow>
        <boxGeometry args={[0.36, 0.035, 0.24]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  )
}

function Shoe({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.07, 0.04]} castShadow>
        <boxGeometry args={[0.15, 0.13, 0.3]} />
        <meshStandardMaterial color={SHOE_COLOR} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.015, 0.04]}>
        <boxGeometry args={[0.16, 0.03, 0.32]} />
        <meshStandardMaterial color={SOLE_COLOR} roughness={0.9} />
      </mesh>
    </group>
  )
}

function Hand({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh scale={[0.85, 1.25, 0.55]} castShadow>
        <sphereGeometry args={[0.075, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
    </group>
  )
}

export function RealisticAvatar({
  loadout,
  moving
}: {
  loadout: AvatarLoadout
  moving: boolean
}) {
  const bodyRef = useRef<THREE.Group>(null)
  const torsoRef = useRef<THREE.Mesh>(null)
  const headRef = useRef<THREE.Group>(null)
  const thighL = useRef<THREE.Group>(null)
  const thighR = useRef<THREE.Group>(null)
  const kneeL = useRef<THREE.Group>(null)
  const kneeR = useRef<THREE.Group>(null)
  const shoulderL = useRef<THREE.Group>(null)
  const shoulderR = useRef<THREE.Group>(null)
  const elbowL = useRef<THREE.Group>(null)
  const elbowR = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const s = moving ? Math.sin(t * 8) : 0
    if (bodyRef.current) {
      bodyRef.current.position.y = moving ? Math.abs(Math.cos(t * 8)) * 0.035 : 0
      bodyRef.current.rotation.x = moving ? 0.05 : 0
    }
    if (torsoRef.current) {
      const breathe = moving ? 1 : 1 + Math.sin(t * 2) * 0.008
      torsoRef.current.scale.set(1, breathe, 1)
    }
    if (headRef.current) {
      headRef.current.rotation.y = moving ? Math.sin(t * 4) * 0.06 : Math.sin(t * 0.5) * 0.18
      headRef.current.rotation.x = moving ? 0.03 : 0
    }
    if (thighL.current) thighL.current.rotation.x = s * 0.55
    if (thighR.current) thighR.current.rotation.x = -s * 0.55
    if (kneeL.current) kneeL.current.rotation.x = moving ? 0.15 + 0.5 * Math.max(0, Math.sin(t * 8 + 0.6)) : 0.06
    if (kneeR.current) kneeR.current.rotation.x = moving ? 0.15 + 0.5 * Math.max(0, Math.sin(t * 8 + Math.PI + 0.6)) : 0.06
    if (shoulderL.current) shoulderL.current.rotation.x = -s * 0.5
    if (shoulderR.current) shoulderR.current.rotation.x = s * 0.5
    if (elbowL.current) elbowL.current.rotation.x = moving ? -0.3 - 0.2 * Math.max(0, -s) : -0.12
    if (elbowR.current) elbowR.current.rotation.x = moving ? -0.3 - 0.2 * Math.max(0, s) : -0.12
  })

  return (
    <group ref={bodyRef}>
      {/* pelvis */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.32, 0.2, 0.22]} />
        <meshStandardMaterial color={loadout.pants} roughness={0.75} />
      </mesh>

      {/* legs */}
      {(
        [
          { side: -1, thigh: thighL, knee: kneeL },
          { side: 1, thigh: thighR, knee: kneeR }
        ] as const
      ).map(({ side, thigh, knee }) => (
        <group key={side} ref={thigh} position={[side * 0.12, 0.95, 0]}>
          <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.115, 0.085, 0.42, 12]} />
            <meshStandardMaterial color={loadout.pants} roughness={0.75} />
          </mesh>
          <mesh position={[0, -0.4, 0.01]}>
            <sphereGeometry args={[0.08, 10, 10]} />
            <meshStandardMaterial color={loadout.pants} roughness={0.75} />
          </mesh>
          <group ref={knee} position={[0, -0.4, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.062, 0.4, 12]} />
              <meshStandardMaterial color={loadout.pants} roughness={0.75} />
            </mesh>
            <Shoe position={[0, -0.4, 0.02]} />
          </group>
        </group>
      ))}

      {/* torso */}
      <mesh ref={torsoRef} position={[0, 1.22, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.23, 0.56, 16]} />
        <meshStandardMaterial color={loadout.shirt} roughness={0.65} />
      </mesh>
      <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.045, 10, 20]} />
        <meshStandardMaterial color={loadout.shirt} roughness={0.65} />
      </mesh>

      {/* backpack */}
      <mesh position={[0, 1.2, -0.28]} castShadow>
        <boxGeometry args={[0.36, 0.46, 0.2]} />
        <meshStandardMaterial color={loadout.backpack} roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.47, -0.28]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.09, 0.09, 0.34, 12]} />
        <meshStandardMaterial color={loadout.backpack} roughness={0.75} />
      </mesh>
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} position={[x, 1.28, -0.15]} rotation={[0.15, 0, 0]}>
          <boxGeometry args={[0.09, 0.42, 0.04]} />
          <meshStandardMaterial color={loadout.backpack} roughness={0.75} />
        </mesh>
      ))}

      {/* arms */}
      {(
        [
          { side: -1, shoulder: shoulderL, elbow: elbowL },
          { side: 1, shoulder: shoulderR, elbow: elbowR }
        ] as const
      ).map(({ side, shoulder, elbow }) => (
        <group key={side} ref={shoulder} position={[side * 0.3, 1.42, 0]}>
          <mesh position={[0, -0.02, 0]}>
            <sphereGeometry args={[0.105, 12, 12]} />
            <meshStandardMaterial color={loadout.shirt} roughness={0.65} />
          </mesh>
          <mesh position={[0, -0.1, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.08, 0.16, 10]} />
            <meshStandardMaterial color={loadout.shirt} roughness={0.65} />
          </mesh>
          <mesh position={[0, -0.22, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.068, 0.26, 10]} />
            <meshStandardMaterial color={loadout.skin} roughness={0.6} />
          </mesh>
          <group ref={elbow} position={[0, -0.34, 0]}>
            <mesh position={[0, -0.12, 0]} castShadow>
              <cylinderGeometry args={[0.065, 0.055, 0.26, 10]} />
              <meshStandardMaterial color={loadout.skin} roughness={0.6} />
            </mesh>
            <Hand position={[0, -0.3, 0.01]} color={loadout.skin} />
          </group>
        </group>
      ))}

      {/* neck + head */}
      <mesh position={[0, 1.53, 0]} castShadow>
        <cylinderGeometry args={[0.07, 0.08, 0.1, 10]} />
        <meshStandardMaterial color={loadout.skin} roughness={0.6} />
      </mesh>
      <group ref={headRef} position={[0, 1.68, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.21, 24, 24]} />
          <meshStandardMaterial color={loadout.skin} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.045, -0.03]} scale={[1, 0.82, 1]}>
          <sphereGeometry args={[0.225, 20, 20]} />
          <meshStandardMaterial color={HAIR_COLOR} roughness={0.9} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.205, 0, 0]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshStandardMaterial color={loadout.skin} roughness={0.6} />
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.075, 0.02, 0.175]}>
              <sphereGeometry args={[0.038, 12, 12]} />
              <meshStandardMaterial color="#ffffff" roughness={0.25} />
            </mesh>
            <mesh position={[side * 0.075, 0.02, 0.205]}>
              <sphereGeometry args={[0.018, 10, 10]} />
              <meshStandardMaterial color="#172033" roughness={0.3} />
            </mesh>
            <mesh position={[side * 0.075, 0.1, 0.19]}>
              <boxGeometry args={[0.07, 0.02, 0.02]} />
              <meshStandardMaterial color={HAIR_COLOR} roughness={0.8} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, -0.03, 0.21]}>
          <sphereGeometry args={[0.03, 10, 10]} />
          <meshStandardMaterial color={loadout.skin} roughness={0.55} />
        </mesh>
        <mesh position={[0, -0.1, 0.19]}>
          <boxGeometry args={[0.09, 0.022, 0.015]} />
          <meshStandardMaterial color="#7c2d12" roughness={0.6} />
        </mesh>
        <RealisticHat style={loadout.hat} color={loadout.hatColor} />
      </group>
    </group>
  )
}
