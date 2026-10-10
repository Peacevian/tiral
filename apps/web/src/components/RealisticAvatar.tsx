"use client"

import { useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { AvatarLoadout, HatStyle } from "@tiral/avatars"

function makeWeaveTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null
  const size = 128
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = "rgba(0,0,0,0.10)"
  ctx.lineWidth = 1
  for (let i = 0; i <= size; i += 4) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(size, i)
    ctx.stroke()
  }
  ctx.fillStyle = "rgba(0,0,0,0.05)"
  for (let i = 0; i < 260; i++) {
    const x = (i * 47) % size
    const y = (i * 89) % size
    ctx.fillRect(x, y, 2, 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(3, 3)
  return texture
}

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
        <meshStandardMaterial color={SHOE_COLOR} roughness={0.4} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.015, 0.04]}>
        <boxGeometry args={[0.16, 0.03, 0.32]} />
        <meshStandardMaterial color={SOLE_COLOR} roughness={0.9} />
      </mesh>
      {[0.1, 0.15, 0.2].map((z) => (
        <mesh key={z} position={[0, 0.135, z - 0.06]} rotation={[Math.PI / 2, 0, Math.PI / 2]}>
          <torusGeometry args={[0.045, 0.012, 8, 12, Math.PI]} />
          <meshStandardMaterial color="#d6c9a8" roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function Hand({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <mesh scale={[0.9, 1.1, 0.6]} castShadow>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      {[-0.045, -0.015, 0.015, 0.045].map((x) => (
        <mesh key={x} position={[x, -0.1, 0.01]} castShadow>
          <capsuleGeometry args={[0.016, 0.06, 3, 8]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0.075, -0.03, 0.02]} rotation={[0, 0, -0.5]}>
        <capsuleGeometry args={[0.015, 0.05, 3, 8]} />
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
  const eyesRef = useRef<THREE.Group>(null)
  const [fabric] = useState<THREE.CanvasTexture | null>(() => makeWeaveTexture())

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const s = moving ? Math.sin(t * 8) : 0
    if (eyesRef.current) {
      const blinkPhase = (t * 0.55) % 1
      eyesRef.current.scale.y = blinkPhase > 0.96 ? 0.12 : 1
    }
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
            <meshStandardMaterial color={loadout.pants} roughness={0.9} map={fabric} />
          </mesh>
          <mesh position={[0, -0.4, 0.01]}>
            <sphereGeometry args={[0.08, 10, 10]} />
            <meshStandardMaterial color={loadout.pants} roughness={0.9} map={fabric} />
          </mesh>
          <group ref={knee} position={[0, -0.4, 0]}>
            <mesh position={[0, -0.2, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.062, 0.4, 12]} />
              <meshStandardMaterial color={loadout.pants} roughness={0.9} map={fabric} />
            </mesh>
            <mesh position={[0, -0.32, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.075, 0.025, 8, 14]} />
              <meshStandardMaterial color={loadout.pants} roughness={0.9} />
            </mesh>
            <Shoe position={[0, -0.4, 0.02]} />
          </group>
        </group>
      ))}

      {/* torso */}
      <mesh ref={torsoRef} position={[0, 1.22, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.23, 0.56, 16]} />
        <meshStandardMaterial color={loadout.shirt} roughness={0.85} map={fabric} />
      </mesh>
      <mesh position={[0, 1.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.045, 10, 20]} />
        <meshStandardMaterial color={loadout.shirt} roughness={0.85} map={fabric} />
      </mesh>
      {[1.34, 1.24, 1.14].map((y) => (
        <mesh key={y} position={[0, y, 0.245]}>
          <sphereGeometry args={[0.022, 8, 8]} />
          <meshStandardMaterial color="#e7e5e4" roughness={0.35} metalness={0.2} />
        </mesh>
      ))}
      <mesh position={[0, 0.96, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.235, 0.035, 8, 20]} />
        <meshStandardMaterial color="#1c1917" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.96, 0.24]}>
        <boxGeometry args={[0.09, 0.07, 0.03]} />
        <meshStandardMaterial color="#d6c9a8" roughness={0.35} metalness={0.6} />
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
      <mesh position={[0, 1.28, -0.385]}>
        <boxGeometry args={[0.2, 0.3, 0.02]} />
        <meshStandardMaterial color="#1c1917" roughness={0.6} />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, 1.08, -0.36]}>
          <boxGeometry args={[0.1, 0.16, 0.06]} />
          <meshStandardMaterial color={loadout.backpack} roughness={0.75} />
        </mesh>
      ))}
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
            <mesh position={[0, -0.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.068, 0.022, 8, 14]} />
              <meshStandardMaterial color={loadout.shirt} roughness={0.85} />
            </mesh>
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
        <group ref={eyesRef}>
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
            </group>
          ))}
        </group>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.075, 0.1, 0.19]}>
            <boxGeometry args={[0.07, 0.02, 0.02]} />
            <meshStandardMaterial color={HAIR_COLOR} roughness={0.8} />
          </mesh>
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
