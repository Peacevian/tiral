"use client"

import { useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"
import { RealisticAvatar, type AvatarAct } from "@/components/RealisticAvatar"

const RUNNER: AvatarLoadout = {
  ...DEFAULT_LOADOUT,
  outfit: "cranes",
  hair: "fade",
  hat: "none",
  skin: "#8d5524",
  pants: "#1c1917",
  shoes: "#e7e5e4"
}

// Faces the viewer three-quarters; turns and sprints out of frame on "run".
function Runner({ act }: { act: AvatarAct }) {
  const groupRef = useRef<THREE.Group>(null)
  const shadowRef = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return
    const running = act === "run"
    const targetTurn = running ? Math.PI / 2 : -0.35
    group.rotation.y += (targetTurn - group.rotation.y) * Math.min(1, delta * 10)
    group.position.x = running ? group.position.x + delta * 5.5 : 0
    if (shadowRef.current) shadowRef.current.position.x = group.position.x
  })

  return (
    <>
      <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <circleGeometry args={[0.42, 32]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <group ref={groupRef}>
        <RealisticAvatar loadout={RUNNER} moving={false} act={act} />
      </group>
    </>
  )
}

export function StreetRunner({ act }: { act: AvatarAct }) {
  return (
    <Canvas
      camera={{ position: [0.4, 1.15, 4.1], fov: 34 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true }}
      onCreated={({ camera, gl, scene }) => {
        camera.lookAt(0, 0.92, 0)
        gl.setClearColor(0x000000, 0)
        scene.background = null
      }}
      style={{ width: "100%", height: "100%" }}
    >
      {/* afternoon sun from the left, warm bounce */}
      <hemisphereLight args={["#fff7e0", "#6b5a3a", 1.2]} />
      <directionalLight position={[-4, 6, 4]} intensity={2.8} color="#fff1cf" />
      <directionalLight position={[3, 2, -2]} intensity={0.9} color="#f2c14e" />
      <Runner act={act} />
    </Canvas>
  )
}
