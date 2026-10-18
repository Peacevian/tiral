"use client"

import { RoundedBox } from "@react-three/drei"
import * as THREE from "three"
import type { FurnitureGrade, FurnitureSpec } from "@tiral/houses"

function shade(color: string, factor: number): string {
  const c = new THREE.Color(color)
  c.multiplyScalar(factor)
  return `#${c.getHexString()}`
}

/**
 * A piece of furniture. Its grade shows: Owino pieces are a little smaller and
 * duller, Acacia Mall pieces stand on a gold trim with a glossy finish.
 */
export function Furniture3D({ spec, color, grade = "owino" }: { spec: FurnitureSpec; color: string; grade?: FurnitureGrade }) {
  if (grade === "kikuubo") return <FurnitureBody spec={spec} color={color} />
  if (grade === "acacia") {
    return (
      <group>
        <mesh position={[0, 0.02, 0]} receiveShadow>
          <boxGeometry args={[spec.width - 0.08, 0.04, spec.depth - 0.08]} />
          <meshStandardMaterial color="#D4A72C" roughness={0.25} metalness={0.9} />
        </mesh>
        <group position={[0, 0.04, 0]}>
          <FurnitureBody spec={spec} color={shade(color, 1.08)} />
        </group>
      </group>
    )
  }
  return (
    <group scale={[0.92, 0.92, 0.92]}>
      <FurnitureBody spec={spec} color={shade(color, 0.82)} />
    </group>
  )
}

function FurnitureBody({ spec, color }: { spec: FurnitureSpec; color: string }) {
  const w = spec.width
  const d = spec.depth
  const dark = shade(color, 0.62)
  const light = shade(color, 1.15)

  switch (spec.id) {
    case "bed":
      return (
        <group>
          <RoundedBox args={[w - 0.15, 0.28, d - 0.15]} radius={0.05} smoothness={3} position={[0, 0.14, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={dark} roughness={0.8} />
          </RoundedBox>
          <RoundedBox args={[w - 0.25, 0.2, d - 0.35]} radius={0.06} smoothness={3} position={[0, 0.36, 0.05]} castShadow>
            <meshStandardMaterial color={light} roughness={0.9} />
          </RoundedBox>
          <mesh position={[0, 0.5, -d / 2 + 0.4]} castShadow>
            <boxGeometry args={[w - 0.4, 0.16, 0.5]} />
            <meshStandardMaterial color="#f8fafc" roughness={0.85} />
          </mesh>
        </group>
      )
    case "table":
      return (
        <group>
          <RoundedBox args={[w - 0.1, 0.08, d - 0.1]} radius={0.03} smoothness={3} position={[0, 0.72, 0]} castShadow>
            <meshStandardMaterial color={color} roughness={0.6} />
          </RoundedBox>
          {([
            [-(w / 2 - 0.15), -(d / 2 - 0.15)],
            [w / 2 - 0.15, -(d / 2 - 0.15)],
            [-(w / 2 - 0.15), d / 2 - 0.15],
            [w / 2 - 0.15, d / 2 - 0.15]
          ] as const).map(([x, z], index) => (
            <mesh key={index} position={[x, 0.36, z]} castShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.72, 8]} />
              <meshStandardMaterial color={dark} roughness={0.7} />
            </mesh>
          ))}
        </group>
      )
    case "chair":
      return (
        <group>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[0.45, 0.08, 0.45]} />
            <meshStandardMaterial color={color} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.72, -0.2]} castShadow>
            <boxGeometry args={[0.45, 0.5, 0.07]} />
            <meshStandardMaterial color={color} roughness={0.65} />
          </mesh>
          {([
            [-0.18, -0.18],
            [0.18, -0.18],
            [-0.18, 0.18],
            [0.18, 0.18]
          ] as const).map(([x, z], index) => (
            <mesh key={index} position={[x, 0.22, z]} castShadow>
              <cylinderGeometry args={[0.03, 0.03, 0.45, 6]} />
              <meshStandardMaterial color={dark} roughness={0.7} />
            </mesh>
          ))}
        </group>
      )
    case "sofa":
      return (
        <group>
          <RoundedBox args={[w - 0.1, 0.35, d - 0.1]} radius={0.08} smoothness={3} position={[0, 0.28, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.85} />
          </RoundedBox>
          <RoundedBox args={[w - 0.1, 0.45, 0.18]} radius={0.06} smoothness={3} position={[0, 0.6, -d / 2 + 0.09]} castShadow>
            <meshStandardMaterial color={light} roughness={0.85} />
          </RoundedBox>
          {[-1, 1].map((side) => (
            <RoundedBox key={side} args={[0.18, 0.4, d - 0.1]} radius={0.05} smoothness={3} position={[(w / 2 - 0.09) * side, 0.45, 0]} castShadow>
              <meshStandardMaterial color={light} roughness={0.85} />
            </RoundedBox>
          ))}
        </group>
      )
    case "rug":
      return (
        <RoundedBox args={[w - 0.1, 0.04, d - 0.1]} radius={0.02} smoothness={2} position={[0, 0.02, 0]} receiveShadow>
          <meshStandardMaterial color={color} roughness={1} />
        </RoundedBox>
      )
    case "plant":
      return (
        <group>
          <mesh position={[0, 0.18, 0]} castShadow>
            <cylinderGeometry args={[0.18, 0.14, 0.36, 12]} />
            <meshStandardMaterial color="#b45309" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.62, 0]} castShadow>
            <icosahedronGeometry args={[0.34, 0]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
          <mesh position={[0.16, 0.5, 0.1]} castShadow>
            <icosahedronGeometry args={[0.2, 0]} />
            <meshStandardMaterial color={shade(color, 0.85)} roughness={0.9} />
          </mesh>
        </group>
      )
    case "shelf":
      return (
        <group>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[(d / 2 - 0.05) * side, 0.9, 0]} castShadow>
              <boxGeometry args={[0.08, 1.8, d - 0.05]} />
              <meshStandardMaterial color={dark} roughness={0.75} />
            </mesh>
          ))}
          {[0.2, 0.75, 1.3, 1.75].map((y) => (
            <mesh key={y} position={[0, y, 0]} castShadow>
              <boxGeometry args={[d - 0.08, 0.06, d - 0.1]} />
              <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
          ))}
        </group>
      )
    case "lamp":
      return (
        <group>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.16, 0.18, 0.05, 12]} />
            <meshStandardMaterial color={dark} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 1, 8]} />
            <meshStandardMaterial color={dark} roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[0, 1.05, 0]} castShadow>
            <cylinderGeometry args={[0.16, 0.24, 0.28, 16, 1, true]} />
            <meshStandardMaterial color={color} roughness={0.6} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )
    case "television":
      return (
        <group>
          <RoundedBox args={[w - 0.2, 0.12, 0.3]} radius={0.03} smoothness={2} position={[0, 0.06, 0]} castShadow>
            <meshStandardMaterial color={dark} roughness={0.6} />
          </RoundedBox>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.36, 8]} />
            <meshStandardMaterial color={dark} roughness={0.6} />
          </mesh>
          <RoundedBox args={[w - 0.1, 0.7, 0.08]} radius={0.04} smoothness={3} position={[0, 1, 0]} castShadow>
            <meshStandardMaterial color="#0b1220" roughness={0.3} />
          </RoundedBox>
        </group>
      )
    case "stove":
      return (
        <group>
          <RoundedBox args={[w - 0.08, 0.9, d - 0.08]} radius={0.04} smoothness={3} position={[0, 0.45, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.5} metalness={0.2} />
          </RoundedBox>
          {([
            [-0.18, -0.4],
            [0.18, -0.4],
            [-0.18, 0.4],
            [0.18, 0.4]
          ] as const).map(([x, z], index) => (
            <mesh key={index} position={[x, 0.92, z]}>
              <cylinderGeometry args={[0.13, 0.13, 0.03, 16]} />
              <meshStandardMaterial color="#111827" roughness={0.4} />
            </mesh>
          ))}
        </group>
      )
    case "fridge":
      return (
        <group>
          <RoundedBox args={[w - 0.12, 1.5, d - 0.12]} radius={0.06} smoothness={3} position={[0, 0.75, 0]} castShadow receiveShadow>
            <meshStandardMaterial color={color} roughness={0.35} metalness={0.15} />
          </RoundedBox>
          <mesh position={[w / 2 - 0.16, 0.95, 0]}>
            <boxGeometry args={[0.04, 0.4, 0.04]} />
            <meshStandardMaterial color={dark} roughness={0.5} metalness={0.3} />
          </mesh>
        </group>
      )
    default:
      return (
        <RoundedBox args={[w - 0.2, 0.6, d - 0.2]} radius={0.05} smoothness={2} position={[0, 0.3, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={color} roughness={0.7} />
        </RoundedBox>
      )
  }
}
