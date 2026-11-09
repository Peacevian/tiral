"use client"

import { Suspense, useEffect, useRef } from "react"
import { notFound } from "next/navigation"
import { Canvas, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import type { DanceFrame } from "@/lib/dance/moves"
import { HERO } from "@/components/film/hero"

// The hero's character sheet for the marketing videos (marketing/higgsfield):
// the game's runner on a plain background, one shot per call of
// window.sheet.shot(name). Development only.


const STAND: DanceFrame = {
  torso: [0, 1, 0.02],
  head: [0, 1, 0.06],
  armL: { upper: [0.2, -1, 0.02], lower: [0.08, -1, 0.15] },
  armR: { upper: [0.2, -1, 0.02], lower: [0.08, -1, 0.15] },
  legL: { upper: [0.07, -1, 0], lower: [0.02, -1, -0.02] },
  legR: { upper: [0.07, -1, 0], lower: [0.02, -1, -0.02] },
  hipsYaw: 0,
  hipsRoll: 0,
  yaw: 0,
  shiftX: 0,
  lift: 0
}

const POSES: Record<string, DanceFrame> = {
  stand: STAND,
  walk: { ...STAND, armL: { upper: [0.12, -1, 0.45], lower: [0.05, -0.6, 0.8] }, armR: { upper: [0.12, -1, -0.35], lower: [0.05, -1, 0.2] }, legL: { upper: [0.05, -1, -0.35], lower: [0.02, -1, -0.5] }, legR: { upper: [0.05, -1, 0.4], lower: [0.02, -1, 0.05] } },
  run: { ...STAND, torso: [0, 1, 0.3], head: [0, 1, 0.3], armL: { upper: [0.15, -0.6, 0.8], lower: [0, 0.6, 0.8] }, armR: { upper: [0.15, -0.8, -0.6], lower: [0, -0.2, 0.9] }, legL: { upper: [0.05, -0.5, 0.85], lower: [0.02, -1, -0.1] }, legR: { upper: [0.05, -1, -0.5], lower: [0.02, -0.4, -1] } },
  money: { ...STAND, head: [0, 0.75, 0.6], armL: { upper: [0.1, -0.55, 0.85], lower: [-0.2, 0.15, 1] }, armR: { upper: [0.1, -0.55, 0.85], lower: [-0.2, 0.15, 1] } },
  stressed: { ...STAND, head: [0, 0.6, 0.75], torso: [0, 1, 0.15], armL: { upper: [0.35, 0.55, 0.65], lower: [-0.45, 0.6, -0.25] }, armR: { upper: [0.35, 0.55, 0.65], lower: [-0.45, 0.6, -0.25] } },
  cheer: { ...STAND, head: [0, 1, -0.1], armL: { upper: [0.45, 0.9, 0.1], lower: [0.15, 1, 0] }, armR: { upper: [0.45, 0.9, 0.1], lower: [0.15, 1, 0] } }
}

// Camera angle around him (0 = facing the camera), height and distance.
const SHOTS: Record<string, { pose: string; yaw: number; y: number; distance: number; target: number; fov: number }> = {
  front: { pose: "stand", yaw: 0, y: 1.0, distance: 4.4, target: 0.92, fov: 30 },
  "three-quarter": { pose: "stand", yaw: -0.75, y: 1.0, distance: 4.4, target: 0.92, fov: 30 },
  side: { pose: "stand", yaw: -Math.PI / 2, y: 1.0, distance: 4.4, target: 0.92, fov: 30 },
  back: { pose: "stand", yaw: Math.PI, y: 1.0, distance: 4.4, target: 0.92, fov: 30 },
  "back-three-quarter": { pose: "stand", yaw: Math.PI - 0.7, y: 1.0, distance: 4.4, target: 0.92, fov: 30 },
  face: { pose: "stand", yaw: -0.3, y: 1.68, distance: 1.25, target: 1.62, fov: 30 },
  walk: { pose: "walk", yaw: -0.9, y: 1.0, distance: 4.4, target: 0.92, fov: 30 },
  run: { pose: "run", yaw: -1.1, y: 1.0, distance: 4.4, target: 0.92, fov: 30 },
  money: { pose: "money", yaw: -0.5, y: 1.25, distance: 3.0, target: 1.1, fov: 30 },
  stressed: { pose: "stressed", yaw: -0.3, y: 1.3, distance: 4.0, target: 1.15, fov: 30 },
  cheer: { pose: "cheer", yaw: -0.3, y: 1.1, distance: 4.6, target: 1.05, fov: 30 }
}

function Rig() {
  const { camera, advance } = useThree()
  const posed = useRef<DanceFrame | null>(STAND)
  const body = useRef<THREE.Group>(null)
  useEffect(() => {
    let clock = 0
    Object.assign(window, {
      sheet: {
        names: Object.keys(SHOTS),
        async shot(name: string) {
          const s = SHOTS[name]!
          posed.current = POSES[s.pose]!
          body.current?.rotation.set(0, s.yaw, 0)
          const cam = camera as THREE.PerspectiveCamera
          cam.fov = s.fov
          cam.position.set(0, s.y, s.distance)
          cam.lookAt(0, s.target, 0)
          cam.updateProjectionMatrix()
          for (let i = 0; i < 3; i++) {
            clock += 1 / 30
            advance(clock)
          }
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
        }
      },
      __filmReady: true
    })
  }, [camera, advance])
  return (
    <>
      <hemisphereLight args={["#FFFFFF", "#A8A29E", 1.7]} />
      <directionalLight position={[2.5, 4, 4]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.8} color="#DCE7F2" />
      <group ref={body}>
        <RealisticAvatar loadout={HERO} moving={false} posed={posed} />
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <circleGeometry args={[0.55, 40]} />
        <meshBasicMaterial color="#000" transparent opacity={0.12} />
      </mesh>
    </>
  )
}

export default function Sheet() {
  if (process.env.NODE_ENV === "production") notFound()
  return (
    <main style={{ position: "fixed", inset: 0, background: "#E9E7E2" }}>
      <style>{"nextjs-portal { display: none !important; }"}</style>
      <Canvas gl={{ antialias: true, preserveDrawingBuffer: true }} frameloop="never" dpr={1} camera={{ position: [0, 1, 4.4], fov: 30 }}>
        <Suspense fallback={null}>
          <Rig />
        </Suspense>
      </Canvas>
    </main>
  )
}
