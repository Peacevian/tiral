"use client"

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { createPortal, useFrame } from "@react-three/fiber"
import { useAnimations, useGLTF } from "@react-three/drei"
import * as THREE from "three"
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js"
import {
  resolveLoadout,
  type AvatarLoadout,
  type GlassesStyle,
  type HairStyle,
  type HatStyle,
  type Outfit
} from "@tiral/avatars"

// Rigged human: "Casual Character" by Quaternius (CC0), see public/models/CREDITS.md.
// Rest (bind) pose is a T-pose about 1.85 tall, feet at y=0, facing +Z.
const MODEL_URL = "/models/runner.glb"
useGLTF.preload(MODEL_URL)

/** Scripted beats for storytelling scenes (the landing hero). */
export const ACT_CLIPS = {
  calm: "CharacterArmature|Idle_Neutral",
  phone: "CharacterArmature|Interact",
  flinch: "CharacterArmature|HitRecieve",
  shock: "CharacterArmature|HitRecieve_2",
  collapse: "CharacterArmature|Death",
  run: "CharacterArmature|Run",
  wave: "CharacterArmature|Wave"
} as const
export type AvatarAct = keyof typeof ACT_CLIPS
// Beats that play once and hold their last pose.
const ONE_SHOT_ACTS: ReadonlySet<AvatarAct> = new Set(["phone", "flinch", "shock", "collapse"])

const CLIPS = {
  idle: "CharacterArmature|Idle",
  walk: "CharacterArmature|Walk",
  run: "CharacterArmature|Run",
  dance: "CharacterArmature|Wave"
} as const

// Where accessories sit in the bind pose (model space), measured from the GLB.
// The procedural hats/hair/glasses were authored for a head of radius 0.21
// centred on the origin, so they're scaled down to this head.
const HEAD_CENTER = new THREE.Vector3(0, 1.68, 0.055)
const HEAD_SCALE = 0.56
// Hats sit a touch lower and tighter than the hair so brims hug the head.
const HAT_POSITION = new THREE.Vector3(0, 1.66, 0.05)
const HAT_SCALE = 0.5
const KANZU_COLOR = "#f5f0e1"
const BODA_VEST_COLOR = "#facc15"
const CRANES_YELLOW = "#facc15"
const SASH_COLOR = "#fbbf24"

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

function Hair({ style, color, hat }: { style: HairStyle; color: string; hat: HatStyle }) {
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

function Glasses({ style }: { style: GlassesStyle }) {
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

// ---------------------------------------------------------------------------
// Outfit painting. Each vertex carries its bind-pose position/normal
// (bodyPos/bodyNormal), so patterns stay glued to the body while it animates.
// Regions: 0 = shirt, 1 = arm skin (sleeves), 2 = trousers.

const TOP_MODE: Record<Outfit, number> = {
  shirt: 0,
  jersey: 1,
  tracksuit: 2,
  hoodie: 3,
  kitenge: 4,
  bodavest: 5,
  kanzu: 6,
  gomesi: 7,
  cranes: 8
}

const PATTERN_GLSL = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uAccent;
uniform int uMode;
varying vec3 vBodyPos;
varying vec3 vBodyNormal;

vec3 tiralColor(vec3 p, vec3 n) {
  vec3 c = uBase;
  float ax = abs(p.x);
  bool front = n.z > 0.35;
#if TIRAL_REGION == 0
  if (uMode == 0) {
    // buttons down the placket
    if (front && ax < 0.011 && p.y > 1.18 && p.y < 1.48 && mod(p.y - 1.18, 0.09) < 0.016) c = vec3(0.85);
  } else if (uMode == 1) {
    // jersey: white collar and sleeve hems
    if (p.y > 1.5 || ax > 0.25) c = vec3(1.0);
  } else if (uMode == 2) {
    // tracksuit zip
    if (front && ax < 0.007) c = vec3(0.8);
  } else if (uMode == 3) {
    // hoodie kangaroo pocket
    if (front && ax < 0.11 && p.y > 1.04 && p.y < 1.17) c = uBase * 0.72;
  } else if (uMode == 4) {
    // kitenge wax print: rings on cream with ochre diamonds
    float cell = 0.07;
    float row = floor(p.y / cell);
    vec2 f = fract(vec2(p.x + p.z * 0.6 + mod(row, 2.0) * cell * 0.5, p.y) / cell) - 0.5;
    float r = length(f);
    c = vec3(0.99, 0.9, 0.57);
    if (abs(f.x) + abs(f.y) > 0.42) c = vec3(0.46, 0.09, 0.01);
    if (r < 0.32) c = uBase;
    if (r < 0.13) c = vec3(0.012, 0.01, 0.008);
  } else if (uMode == 5) {
    // boda vest over the shirt, reflective bands
    if (ax < 0.2) {
      c = uAccent;
      if ((p.y > 1.17 && p.y < 1.205) || (p.y > 1.37 && p.y < 1.405)) c = vec3(0.78);
    }
  } else if (uMode == 6) {
    // kanzu: embroidered placket and collar in the accent colour
    c = uBase;
    if ((front && ax < 0.013 && p.y > 1.28) || p.y > 1.51) c = uAccent;
  } else if (uMode == 8) {
    // Cranes kit: black and red chest bands, black collar, red cuffs
    if (p.y > 1.38 && p.y < 1.43) c = vec3(0.006, 0.009, 0.021);
    if (p.y > 1.31 && p.y < 1.36) c = vec3(0.72, 0.02, 0.02);
    if (p.y > 1.505) c = vec3(0.006, 0.009, 0.021);
    if (ax > 0.255) c = vec3(0.72, 0.02, 0.02);
  }
#elif TIRAL_REGION == 1
  // arms (T-pose: wrists at |x| ~0.57). uBase = skin, uAccent = sleeve.
  if (uMode >= 1 && ax < 0.555) {
    c = uAccent;
    if (uMode == 2 && n.y > 0.8) c = vec3(0.92);
  }
#else
  // trousers; tracksuit gets a stripe down the outside of each leg
  if (uMode == 1 && ax > 0.163 && n.x * sign(p.x) > 0.55) c = vec3(0.92);
#endif
  return c;
}
`

type PatternUniforms = {
  uBase: { value: THREE.Color }
  uAccent: { value: THREE.Color }
  uMode: { value: number }
}

function makePatternMaterial(source: THREE.Material, region: 0 | 1 | 2): THREE.MeshStandardMaterial {
  const material = (source as THREE.MeshStandardMaterial).clone()
  const uniforms: PatternUniforms = {
    uBase: { value: new THREE.Color() },
    uAccent: { value: new THREE.Color() },
    uMode: { value: 0 }
  }
  material.userData.pattern = uniforms
  material.defines = { ...(material.defines ?? {}), TIRAL_REGION: region }
  material.customProgramCacheKey = () => `tiral-pattern-${region}`
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute vec3 bodyPos;\nattribute vec3 bodyNormal;\nvarying vec3 vBodyPos;\nvarying vec3 vBodyNormal;"
      )
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBodyPos = bodyPos;\nvBodyNormal = bodyNormal;")
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${PATTERN_GLSL}`)
      .replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb = tiralColor(vBodyPos, normalize(vBodyNormal));"
      )
  }
  return material
}

/** Bake bind-pose position/normal into each skinned geometry (once per GLB). */
function prepareBodyAttributes(scene: THREE.Object3D) {
  if (scene.userData.tiralPrepared) return
  scene.updateMatrixWorld(true)
  const v = new THREE.Vector3()
  const normalMatrix = new THREE.Matrix3()
  scene.traverse((object) => {
    const mesh = object as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    const geometry = mesh.geometry
    const position = geometry.getAttribute("position")
    const normal = geometry.getAttribute("normal")
    const bodyPos = new Float32Array(position.count * 3)
    const bodyNormal = new Float32Array(position.count * 3)
    normalMatrix.getNormalMatrix(mesh.matrixWorld)
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
      bodyPos.set([v.x, v.y, v.z], i * 3)
      if (normal) {
        v.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize()
        bodyNormal.set([v.x, v.y, v.z], i * 3)
      }
    }
    geometry.setAttribute("bodyPos", new THREE.BufferAttribute(bodyPos, 3))
    geometry.setAttribute("bodyNormal", new THREE.BufferAttribute(bodyNormal, 3))
  })
  scene.userData.tiralPrepared = true
}

type Parts = {
  top: THREE.MeshStandardMaterial[]
  arms: THREE.MeshStandardMaterial[]
  legs: THREE.MeshStandardMaterial[]
  skin: THREE.MeshStandardMaterial[]
  skinShade: THREE.MeshStandardMaterial[]
  hair: THREE.MeshStandardMaterial[]
  brows: THREE.MeshStandardMaterial[]
  shoes: THREE.MeshStandardMaterial[]
  hairMeshes: THREE.Object3D[]
  legMeshes: THREE.Object3D[]
}

/** Clone the rig for this avatar and give it its own recolourable materials. */
function instantiate(scene: THREE.Object3D) {
  prepareBodyAttributes(scene)
  const root = SkeletonUtils.clone(scene)
  const parts: Parts = { top: [], arms: [], legs: [], skin: [], skinShade: [], hair: [], brows: [], shoes: [], hairMeshes: [], legMeshes: [] }
  const bones = new Map<string, THREE.Bone>()
  let skeleton: THREE.Skeleton | null = null

  root.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones.set(object.name, object as THREE.Bone)
    const mesh = object as THREE.SkinnedMesh
    if (!mesh.isMesh) return
    mesh.castShadow = true
    // Bounds come from the T-pose; animated limbs leave them, so never cull.
    mesh.frustumCulled = false
    if (mesh.isSkinnedMesh && !skeleton) skeleton = mesh.skeleton
    const source = mesh.material as THREE.MeshStandardMaterial
    const isBody = mesh.name.startsWith("Casual2_Body")
    switch (source.name) {
      case "LightBrown":
        mesh.material = makePatternMaterial(source, 0)
        parts.top.push(mesh.material as THREE.MeshStandardMaterial)
        break
      case "Skin":
        if (isBody) {
          mesh.material = makePatternMaterial(source, 1)
          parts.arms.push(mesh.material as THREE.MeshStandardMaterial)
        } else {
          mesh.material = source.clone()
          parts.skin.push(mesh.material as THREE.MeshStandardMaterial)
        }
        break
      case "LightBlue":
        mesh.material = makePatternMaterial(source, 2)
        parts.legs.push(mesh.material as THREE.MeshStandardMaterial)
        parts.legMeshes.push(mesh)
        break
      case "Skin_Darker":
        mesh.material = source.clone()
        parts.skinShade.push(mesh.material as THREE.MeshStandardMaterial)
        break
      case "Hair":
        mesh.material = source.clone()
        parts.hair.push(mesh.material as THREE.MeshStandardMaterial)
        parts.hairMeshes.push(mesh)
        break
      case "Eyebrows":
        mesh.material = source.clone()
        parts.brows.push(mesh.material as THREE.MeshStandardMaterial)
        break
      case "Red_Dark":
        mesh.material = source.clone()
        parts.shoes.push(mesh.material as THREE.MeshStandardMaterial)
        break
    }
  })

  // Snap to the bind pose so accessory offsets can be measured in model space.
  ;(skeleton as THREE.Skeleton | null)?.pose()
  root.updateMatrixWorld(true)
  const bindInverse = new Map<string, THREE.Matrix4>()
  for (const [name, bone] of bones) bindInverse.set(name, bone.matrixWorld.clone().invert())

  return { root, parts, bones, bindInverse }
}

function setPattern(materials: THREE.MeshStandardMaterial[], mode: number, base: string, accent: string) {
  for (const material of materials) {
    const uniforms = material.userData.pattern as PatternUniforms
    uniforms.uMode.value = mode
    uniforms.uBase.value.set(base)
    uniforms.uAccent.value.set(accent)
  }
}

function setColor(materials: THREE.MeshStandardMaterial[], color: string | THREE.Color) {
  for (const material of materials) material.color.set(color)
}

/** Children are written in bind-pose model coordinates but ride along with `bone`. */
function OnBone({
  rig,
  bone,
  children
}: {
  rig: ReturnType<typeof instantiate>
  bone: string
  children: ReactNode
}) {
  const target = rig.bones.get(bone)
  const inverse = rig.bindInverse.get(bone)
  if (!target || !inverse) return null
  return createPortal(
    <group matrix={inverse} matrixAutoUpdate={false}>
      {children}
    </group>,
    target
  )
}

function Backpack({ color }: { color: string }) {
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
      {[-1, 1].map((side) => (
        // Straps over the shoulders; only their tops show from the front.
        <mesh key={side} position={[side * 0.095, 1.5, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.035, 0.24, 0.012]} />
          <meshStandardMaterial color="#1c1917" roughness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function useNumberTexture(enabled: boolean) {
  const texture = useMemo(() => (enabled ? makeNumberTexture("10") : null), [enabled])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}

export type AvatarPose = "auto" | "dance"

function HumanAvatar({
  loadout,
  moving,
  pose,
  gait,
  act
}: {
  loadout: AvatarLoadout
  moving: boolean
  pose: AvatarPose
  gait: "walk" | "run"
  act?: AvatarAct
}) {
  const { scene, animations } = useGLTF(MODEL_URL)
  const rig = useMemo(() => instantiate(scene), [scene])
  const { actions } = useAnimations(animations, rig.root)
  const resolved = resolveLoadout(loadout)
  const { outfit, hair, hairColor, hat, glasses, shoes, skin, shirt, pants } = resolved
  const numberTexture = useNumberTexture(outfit === "jersey")
  const spinRef = useRef<THREE.Group>(null)

  // Colours and outfit painting.
  useLayoutEffect(() => {
    const { parts } = rig
    const top =
      outfit === "kanzu" ? KANZU_COLOR : outfit === "cranes" ? CRANES_YELLOW : shirt
    const accent = outfit === "bodavest" ? BODA_VEST_COLOR : shirt
    setPattern(parts.top, TOP_MODE[outfit], top, accent)
    const sleeve = outfit === "kanzu" ? KANZU_COLOR : shirt
    const sleeveMode = outfit === "tracksuit" ? 2 : outfit === "hoodie" || outfit === "kanzu" ? 1 : 0
    setPattern(parts.arms, sleeveMode, skin, sleeve)
    setPattern(parts.legs, outfit === "tracksuit" ? 1 : 0, pants, pants)
    setColor(parts.skin, skin)
    setColor(parts.skinShade, new THREE.Color(skin).multiplyScalar(0.82))
    setColor(parts.hair, hairColor)
    setColor(parts.brows, hairColor)
    setColor(parts.shoes, shoes)
    // The model's own hair is the "short" style; full-coverage hats hide it.
    const ownHair = hair === "short" && hat !== "helmet" && hat !== "headwrap" && hat !== "beanie"
    for (const mesh of parts.hairMeshes) mesh.visible = ownHair
    // Robes hang from the hips; hiding the trousers stops striding legs
    // poking through the cloth (the shoes still show under the hem).
    const robed = outfit === "kanzu" || outfit === "gomesi"
    for (const mesh of parts.legMeshes) mesh.visible = !robed
  }, [rig, outfit, shirt, skin, pants, hairColor, shoes, hair, hat])

  // Animation state machine with short cross-fades.
  const clip = act
    ? ACT_CLIPS[act]
    : pose === "dance"
      ? CLIPS.dance
      : moving
        ? CLIPS[gait]
        : CLIPS.idle
  useEffect(() => {
    const action = actions[clip]
    if (!action) return
    if (act) {
      const once = ONE_SHOT_ACTS.has(act)
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
      action.clampWhenFinished = once
      action.reset().fadeIn(0.2).play()
      return () => {
        action.fadeOut(0.2)
      }
    }
    // Racing: mix some idle pose into the run so the stride stays compact on
    // the map instead of legs splaying across the road. (Fixed weights here —
    // a fadeIn would animate the weight back to 1.)
    const stance = clip === CLIPS.run ? actions[CLIPS.idle] : null
    if (stance) {
      action.reset().setEffectiveWeight(0.7).play()
      stance.reset().setEffectiveWeight(0.3).play()
    } else {
      action.reset().fadeIn(0.25).play()
    }
    return () => {
      action.fadeOut(0.25)
      stance?.fadeOut(0.25)
    }
  }, [actions, clip, act])

  // A little celebratory hop and turn on top of the wave.
  useFrame(({ clock }) => {
    const group = spinRef.current
    if (!group) return
    if (pose === "dance" && !act) {
      const t = clock.elapsedTime
      group.position.y = Math.abs(Math.sin(t * 5)) * 0.08
      group.rotation.y = Math.sin(t * 1.4) * 0.6
    } else if (group.position.y !== 0 || group.rotation.y !== 0) {
      group.position.y = 0
      group.rotation.y = 0
    }
  })

  const robe = outfit === "kanzu" ? KANZU_COLOR : outfit === "gomesi" ? shirt : null

  return (
    <group ref={spinRef}>
      <primitive object={rig.root} />

      <OnBone rig={rig} bone="Head">
        {hair !== "short" && hat !== "helmet" && (
          <group position={HEAD_CENTER} scale={HEAD_SCALE}>
            <Hair style={hair} color={hairColor} hat={hat} />
          </group>
        )}
        <group position={HAT_POSITION} scale={HAT_SCALE}>
          <RealisticHat style={hat} color={resolved.hatColor} />
        </group>
        <group position={[0, 1.672, 0.07]} scale={HEAD_SCALE}>
          <Glasses style={glasses} />
        </group>
      </OnBone>

      <OnBone rig={rig} bone="Chest">
        <Backpack color={resolved.backpack} />
        {outfit === "jersey" && numberTexture && (
          <mesh position={[0, 1.3, 0.195]}>
            <planeGeometry args={[0.13, 0.13]} />
            <meshBasicMaterial map={numberTexture} transparent depthWrite={false} />
          </mesh>
        )}
        {outfit === "cranes" && (
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
        )}
      </OnBone>

      {outfit === "hoodie" && (
        <OnBone rig={rig} bone="Neck">
          <mesh position={[0, 1.53, -0.075]} scale={[1.35, 0.85, 1.1]} castShadow>
            <sphereGeometry args={[0.09, 16, 12]} />
            <meshStandardMaterial color={shirt} roughness={0.85} />
          </mesh>
        </OnBone>
      )}

      {robe && (
        <OnBone rig={rig} bone="Hips">
          <mesh position={[0, 0.58, 0.05]} castShadow>
            <cylinderGeometry args={[0.19, outfit === "gomesi" ? 0.36 : 0.3, 0.95, 28, 1, true]} />
            <meshStandardMaterial color={robe} roughness={0.85} side={THREE.DoubleSide} />
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
        </OnBone>
      )}

      {outfit === "gomesi" &&
        (["UpperArmL", "UpperArmR"] as const).map((bone, i) => (
          // Gomesi's signature puffed, peaked shoulders.
          <OnBone key={bone} rig={rig} bone={bone}>
            <group position={[(i === 0 ? 1 : -1) * 0.2, 1.46, 0.06]}>
              <mesh>
                <sphereGeometry args={[0.085, 14, 12]} />
                <meshStandardMaterial color={shirt} roughness={0.7} />
              </mesh>
              <mesh position={[0, 0.08, 0]}>
                <coneGeometry args={[0.06, 0.1, 12]} />
                <meshStandardMaterial color={shirt} roughness={0.7} />
              </mesh>
            </group>
          </OnBone>
        ))}
    </group>
  )
}

export function RealisticAvatar({
  loadout,
  moving,
  pose = "auto",
  gait = "walk",
  act
}: {
  loadout: AvatarLoadout
  moving: boolean
  /** "dance" plays the victory celebration. */
  pose?: AvatarPose
  /** Which cycle plays while moving: strolling at home, running in races. */
  gait?: "walk" | "run"
  /** Scripted beat; overrides pose/moving (storytelling scenes only). */
  act?: AvatarAct
  /** Kept for callers; the rigged model is light enough to use everywhere. */
  detail?: "full" | "lite"
}) {
  return (
    <Suspense fallback={null}>
      <HumanAvatar loadout={loadout} moving={moving} pose={pose} gait={gait} act={act} />
    </Suspense>
  )
}
