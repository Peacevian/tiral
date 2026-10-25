"use client"

import { useEffect, useMemo } from "react"
import * as THREE from "three"
import type { GlassesStyle, HairStyle, HatStyle, Outfit } from "@tiral/avatars"

// The avatar's add-ons, built from shapes: hats, hair, glasses, the backpack
// and outfit details. Shared by the old model (RealisticAvatar) and the new
// bodies (NewBody), which carry them on their bones. Hats, hair and glasses
// are made for a head of radius 0.21 centred on the origin; the rest is
// placed on the old model's body (1.85 tall, facing +Z), and the new bodies
// map it onto theirs.

export const KANZU_COLOR = "#f5f0e1"
export const BODA_VEST_COLOR = "#facc15"
export const CRANES_YELLOW = "#facc15"
export const SASH_COLOR = "#fbbf24"

/** Jersey number decal. */
function makeNumberTexture(text: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null
  const canvas = document.createElement("canvas")
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.font = "900 44px system-ui, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.lineWidth = 6
  ctx.strokeStyle = "rgba(15,23,42,0.6)"
  ctx.strokeText(text, 32, 34)
  ctx.fillStyle = "#ffffff"
  ctx.fillText(text, 32, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function RealisticHat({ style, color }: { style: HatStyle; color: string }) {
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
  if (style === "helmet") {
    // Boda boda helmet: glossy shell, centre stripe, tinted visor.
    return (
      <group>
        <mesh position={[0, 0.02, -0.01]} castShadow>
          <sphereGeometry args={[0.275, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.58]} />
          <meshStandardMaterial color={color} roughness={0.25} metalness={0.2} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.02, -0.01]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.278, 0.022, 8, 24, Math.PI]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.03, 0.235]} rotation={[-0.25, 0, 0]}>
          <boxGeometry args={[0.32, 0.13, 0.025]} />
          <meshStandardMaterial color="#0f172a" roughness={0.1} metalness={0.5} transparent opacity={0.8} />
        </mesh>
      </group>
    )
  }
  if (style === "headwrap") {
    // Gele-style wrap with a knot at the front.
    return (
      <group>
        <mesh position={[0, 0.13, -0.02]} scale={[1.08, 0.78, 1.12]} castShadow>
          <sphereGeometry args={[0.235, 20, 16]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2 + 0.15, 0, 0]} castShadow>
          <torusGeometry args={[0.22, 0.05, 10, 24]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[0, 0.3, 0.1]} scale={[1.3, 0.8, 0.8]} castShadow>
          <sphereGeometry args={[0.085, 12, 12]} />
          <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[0.1, 0.27, 0.06]} rotation={[0, 0, -0.7]} scale={[1.4, 0.6, 0.7]}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshStandardMaterial color={color} roughness={0.7} />
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

const LOC_ANGLES = [-2.6, -2.2, -1.8, -1.4, -1.0, 1.0, 1.4, 1.8, 2.2, 2.6, Math.PI]
const BRAID_ROWS = [-0.13, -0.065, 0, 0.065, 0.13]

export function Hair({ style, color, hat }: { style: HairStyle; color: string; hat: HatStyle }) {
  if (style === "bald") return null
  // Full helmets hide the hair; other hats squash big styles.
  if (hat === "helmet") return null
  const material = <meshStandardMaterial color={color} roughness={0.9} />
  if (style === "afro") {
    const radius = hat === "none" ? 0.31 : 0.27
    return (
      <mesh position={[0, 0.09, -0.05]} castShadow>
        <sphereGeometry args={[radius, 22, 18]} />
        <meshStandardMaterial color={color} roughness={1} />
      </mesh>
    )
  }
  if (style === "fade") {
    return (
      <mesh position={[0, 0.07, -0.02]} scale={[1, 0.66, 1]}>
        <sphereGeometry args={[0.218, 20, 16]} />
        {material}
      </mesh>
    )
  }
  if (style === "braids") {
    return (
      <group>
        <mesh position={[0, 0.06, -0.02]} scale={[1, 0.72, 1]}>
          <sphereGeometry args={[0.216, 20, 16]} />
          {material}
        </mesh>
        {BRAID_ROWS.map((x) => (
          <mesh key={x} position={[x, 0.02, -0.02]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[Math.sqrt(0.222 ** 2 - x * x), 0.02, 6, 20, Math.PI * 0.82]} />
            {material}
          </mesh>
        ))}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.1, -0.16, -0.17]} rotation={[0.25, 0, side * 0.12]} castShadow>
            <capsuleGeometry args={[0.03, 0.26, 4, 8]} />
            {material}
          </mesh>
        ))}
      </group>
    )
  }
  if (style === "locs") {
    return (
      <group>
        <mesh position={[0, 0.05, -0.03]} scale={[1.02, 0.84, 1.02]}>
          <sphereGeometry args={[0.226, 20, 16]} />
          {material}
        </mesh>
        {LOC_ANGLES.map((angle) => (
          <mesh
            key={angle}
            position={[Math.sin(angle) * 0.2, -0.1, Math.cos(angle) * 0.2]}
            rotation={[Math.cos(angle) * -0.25, 0, Math.sin(angle) * 0.25]}
            castShadow
          >
            <capsuleGeometry args={[0.03, 0.26, 4, 8]} />
            {material}
          </mesh>
        ))}
      </group>
    )
  }
  return (
    <mesh position={[0, 0.045, -0.03]} scale={[1, 0.82, 1]}>
      <sphereGeometry args={[0.225, 20, 20]} />
      {material}
    </mesh>
  )
}

export function Glasses({ style }: { style: GlassesStyle }) {
  if (style === "none") return null
  const frame = "#1f2937"
  const lens = "#7dd3fc"
  return (
    <group position={[0, 0.03, 0.17]}>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.08, 0, 0.02]}>
          {style === "round" ? (
            <torusGeometry args={[0.055, 0.012, 8, 20]} />
          ) : (
            <boxGeometry args={[0.11, 0.08, 0.02]} />
          )}
          <meshStandardMaterial color={frame} roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={`lens-${side}`} position={[side * 0.08, 0, 0.035]}>
          {style === "round" ? (
            <circleGeometry args={[0.05, 20]} />
          ) : (
            <planeGeometry args={[0.1, 0.07]} />
          )}
          <meshStandardMaterial color={lens} transparent opacity={0.28} roughness={0.1} />
        </mesh>
      ))}
      <mesh position={[0, 0.005, 0.02]}>
        <boxGeometry args={[0.05, 0.014, 0.014]} />
        <meshStandardMaterial color={frame} roughness={0.4} metalness={0.3} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={`arm-${side}`} position={[side * 0.155, 0.01, -0.06]} rotation={[0, side * 0.5, 0]}>
          <boxGeometry args={[0.014, 0.014, 0.16]} />
          <meshStandardMaterial color={frame} roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
    </group>
  )
}

/** `straps`: over the shoulders (off on the new bodies: slimmer, they poke through the shirt). */
export function Backpack({ color, straps = true }: { color: string; straps?: boolean }) {
  return (
    <group>
      <mesh position={[0, 1.27, -0.135]} castShadow>
        <boxGeometry args={[0.26, 0.32, 0.13]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.44, -0.13]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.24, 12]} />
        <meshStandardMaterial color={color} roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.22, -0.205]}>
        <boxGeometry args={[0.15, 0.17, 0.02]} />
        <meshStandardMaterial color="#1c1917" roughness={0.6} />
      </mesh>
      {straps && [-1, 1].map((side) => (
        // Straps over the shoulders; only their tops show from the front.
        <mesh key={side} position={[side * 0.095, 1.5, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.035, 0.24, 0.012]} />
          <meshStandardMaterial color="#1c1917" roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

export function useNumberTexture(enabled: boolean) {
  const texture = useMemo(() => (enabled ? makeNumberTexture("10") : null), [enabled])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

/** The jersey's number on the chest. */
export function JerseyNumber({ texture }: { texture: THREE.Texture }) {
  return (
    <mesh position={[0, 1.3, 0.195]}>
      <planeGeometry args={[0.13, 0.13]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

/** The Uganda Cranes crest on the kit. */
export function CranesBadge() {
  return (
    <group position={[0.075, 1.25, 0.19]}>
      <mesh>
        <circleGeometry args={[0.024, 16]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <circleGeometry args={[0.012, 12]} />
        <meshStandardMaterial color="#dc2626" roughness={0.5} />
      </mesh>
    </group>
  )
}

/** The hoodie's hood, down on the back of the neck. */
export function Hood({ color }: { color: string }) {
  return (
    <mesh position={[0, 1.53, -0.075]} scale={[1.35, 0.85, 1.1]} castShadow>
      <sphereGeometry args={[0.09, 16, 12]} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  )
}

/** A kanzu or gomesi skirt hanging from the hips (the gomesi with its sash). */
export function Robe({ outfit, color }: { outfit: Outfit; color: string }) {
  return (
    <>
      <mesh position={[0, 0.58, 0.05]} castShadow>
        <cylinderGeometry args={[0.19, outfit === "gomesi" ? 0.36 : 0.3, 0.95, 28, 1, true]} />
        <meshStandardMaterial color={color} roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      {outfit === "gomesi" && (
        <>
          <mesh position={[0, 1.04, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.195, 0.035, 10, 28]} />
            <meshStandardMaterial color={SASH_COLOR} roughness={0.45} metalness={0.2} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.05, 1.04, -0.16]} rotation={[0, 0, side * 0.6]} scale={[1.4, 0.7, 0.5]}>
              <sphereGeometry args={[0.05, 12, 10]} />
              <meshStandardMaterial color={SASH_COLOR} roughness={0.45} metalness={0.2} />
            </mesh>
          ))}
        </>
      )}
    </>
  )
}

/** The gomesi's puffed, peaked shoulder; side 1 is the model's left. */
export function GomesiShoulder({ side, color }: { side: 1 | -1; color: string }) {
  return (
    <group position={[side * 0.2, 1.46, 0.06]}>
      <mesh>
        <sphereGeometry args={[0.085, 14, 12]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.08, 0]}>
        <coneGeometry args={[0.06, 0.1, 12]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  )
}
