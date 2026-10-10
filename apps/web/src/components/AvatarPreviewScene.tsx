"use client"

import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import type { AvatarLoadout } from "@tiral/avatars"
import { AvatarModel } from "./Avatar3D"

export function AvatarPreviewScene({
  loadout,
  walking
}: {
  loadout: AvatarLoadout
  walking: boolean
}) {
  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      camera={{ position: [2.6, 1.9, 3.2], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
    >
      <hemisphereLight args={["#fff4d6", "#293548", 1.4]} />
      <directionalLight position={[4, 8, 6]} intensity={2} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[1.6, 48]} />
        <meshStandardMaterial color="#1e293b" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[1.1, 1.25, 48]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <AvatarModel loadout={loadout} moving={walking} />
      <OrbitControls
        target={[0, 0.95, 0]}
        enablePan={false}
        minDistance={2}
        maxDistance={8}
        maxPolarAngle={Math.PI / 2 + 0.15}
        autoRotate
        autoRotateSpeed={1.6}
      />
    </Canvas>
  )
}
