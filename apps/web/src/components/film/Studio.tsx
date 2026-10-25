"use client"

import { Suspense, useEffect } from "react"
import { Canvas, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import type { AvatarLoadout } from "@tiral/avatars"
import { NewBody } from "@/components/NewBody"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import { HERO } from "./hero"

// A plain room for looking closely at the new bodies (/dev/hero?studio=1):
// the current avatar on the left, then the cast in a row, on a grey floor,
// with a camera you can drag round. window.__studioCamera(x, y, z, tx, ty, tz)
// moves it from the console (for screenshots).

const SPACING = 0.9

export function Studio({ cast, clip }: { cast: AvatarLoadout[]; clip: string }) {
  const width = cast.length * SPACING
  return (
    <Canvas shadows camera={{ position: [0, 1.5, 3.2], fov: 35 }}>
      <ConsoleCamera />
      <color attach="background" args={["#d9d4cb"]} />
      <hemisphereLight args={["#FFF1DC", "#6B5A48", 1.4]} />
      <directionalLight position={[2, 4, 3]} intensity={2.2} color="#FFE2B8" castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#bdb6aa" />
      </mesh>
      <Suspense fallback={null}>
        <group position={[-width / 2 - SPACING, 0, 0]}>
          <RealisticAvatar loadout={HERO} moving={false} />
        </group>
        {cast.map((loadout, i) => (
          <group key={i} position={[-width / 2 + i * SPACING, 0, 0]}>
            <NewBody loadout={loadout} moving={false} clip={clip} />
          </group>
        ))}
      </Suspense>
      <OrbitControls makeDefault target={[0, 1.1, 0]} />
    </Canvas>
  )
}

/** window.__studioCamera(x, y, z, tx, ty, tz): the camera at x, y, z looking at tx, ty, tz. */
function ConsoleCamera() {
  const get = useThree((state) => state.get)
  useEffect(() => {
    Object.assign(window, {
      __studioCamera: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => {
        const { camera, controls } = get()
        camera.position.set(x, y, z)
        const orbit = controls as unknown as { target: { set(x: number, y: number, z: number): void }; update(): void } | null
        orbit?.target.set(tx, ty, tz)
        orbit?.update()
      }
    })
  }, [get])
  return null
}
