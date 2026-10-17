"use client"

import { PerformanceMonitor } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import { maxSceneDpr } from "@/lib/deviceTier"

/**
 * Inside a 3D scene: if it runs slowly on this phone, draw it at 1× until it
 * recovers; when it's smooth, back to the sharpest resolution allowed. Weak
 * phones stay smooth by how they actually perform, not a guess.
 */
export function AdaptiveQuality() {
  const setDpr = useThree((state) => state.setDpr)
  return (
    <PerformanceMonitor
      // Drop below 30 fps (really struggling, not a hiccup while loading);
      // recover above 50 fps. drei's default recovers only above 60, which a
      // 60 Hz phone never reaches, so one stutter would leave it blurry.
      bounds={() => [30, 50]}
      flipflops={3}
      onDecline={() => setDpr(1)}
      onIncline={() => setDpr(maxSceneDpr())}
      // Kept changing its mind: settle on the light setting.
      onFallback={() => setDpr(1)}
    />
  )
}
