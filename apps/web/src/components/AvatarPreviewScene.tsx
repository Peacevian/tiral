"use client"

import { Canvas } from "@react-three/fiber"
import { Environment, Lightformer, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import type { AvatarLoadout } from "@tiral/avatars"
import { RealisticAvatar } from "./RealisticAvatar"

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
      shadows
    >
      <hemisphereLight args={["#fff4d6", "#293548", 0.55]} />
      <directionalLight
        position={[4, 7, 5]}
        intensity={2.4}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-5, 3, 2]} intensity={0.55} color="#bcd3ff" />
      <directionalLight position={[-1, 4, -6]} intensity={1.1} color="#ffd9a0" />
      <Environment resolution={256}>
        <group rotation={[-Math.PI / 3, 0, 1]}>
          <Lightformer form="circle" intensity={5} position={[0, 5, -9]} scale={2} />
          <Lightformer form="rect" intensity={2} position={[-5, 1, -1]} scale={[3, 0.8, 1]} />
          <Lightformer form="rect" intensity={2} position={[5, -1, -1]} scale={[3, 0.8, 1]} color="#bcd3ff" />
        </group>
      </Environment>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[1.6, 48]} />
        <meshStandardMaterial color="#1e293b" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <ringGeometry args={[1.1, 1.25, 48]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <RealisticAvatar loadout={loadout} moving={walking} />
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
