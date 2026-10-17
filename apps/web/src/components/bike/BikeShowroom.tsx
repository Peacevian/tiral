"use client"

import { Canvas } from "@react-three/fiber"
import { ContactShadows, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import type { BikeLook } from "@tiral/game-core"
import { Bike3D } from "./Bike3D"
import { sceneQuality } from "@/lib/deviceTier"
import { AdaptiveQuality } from "@/components/AdaptiveQuality"

/** Home → Bike: the selected bike, big, on a turntable you can spin. */
export function BikeShowroom({ look, paused = false }: { look: BikeLook; paused?: boolean }) {
  // Lighter on low-end / slow phones (no shadows, 1× pixels): lib/deviceTier.ts
  const quality = sceneQuality()
  return (
    <Canvas camera={{ position: [3.3, 1.7, 3.0], fov: 36 }} gl={{ antialias: quality.antialias, alpha: true }} dpr={quality.dpr} shadows={quality.shadows} frameloop={paused ? "never" : "always"}>
      <AdaptiveQuality />
      <hemisphereLight args={["#fff4d6", "#b9c9a6", 1.0]} />
      <directionalLight position={[3, 6, 4]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2, -3]} intensity={0.7} color="#bcd3ff" />
      {/* Garage floor with a turntable ring. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[1.6, 48]} />
        <meshStandardMaterial color="#DCE6F2" roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[1.45, 1.55, 64]} />
        <meshBasicMaterial color="#E85F0C" transparent opacity={0.6} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* The bike stands still (only the camera orbits), so the shadow is drawn
          once per look instead of every frame. */}
      <ContactShadows key={JSON.stringify(look)} frames={1} position={[0, 0.01, 0]} opacity={0.5} scale={4} blur={2.2} far={1.5} />
      <Bike3D look={look} plateSeed={look.model} />
      <OrbitControls
        target={[0, 0.6, 0]}
        enablePan={false}
        minDistance={1.8}
        maxDistance={5}
        maxPolarAngle={Math.PI / 2 - 0.05}
        autoRotate
        autoRotateSpeed={1.2}
      />
    </Canvas>
  )
}
