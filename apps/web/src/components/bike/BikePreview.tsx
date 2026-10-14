"use client"

import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import type { BikeLook } from "@tiral/game-core"
import { Bike3D } from "./Bike3D"

/** A small turntable of a bike (garage, showroom). */
export function BikePreview({ look }: { look: BikeLook }) {
  return (
    <Canvas camera={{ position: [2.1, 1.1, 1.9], fov: 34 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
      <hemisphereLight args={["#fff4d6", "#293548", 0.9]} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#bcd3ff" />
      <Bike3D look={look} />
      <OrbitControls target={[0, 0.55, 0]} enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={2} />
    </Canvas>
  )
}
