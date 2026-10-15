"use client"

import { createContext, useContext, useMemo, useRef, type MutableRefObject } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { buildMercatorViewProjectionMatrix, lngLatToMercator } from "@tiral/map"
import type { MapTransformLike } from "@tiral/map"
import { isLiteDevice } from "@/lib/deviceTier"

// worldSize: CSS px across the whole mercator world at the current zoom.
type Origin = { x: number; y: number; worldSize: number }

// Relative-to-centre rendering. Mercator coordinates are ~0.5 while avatars
// are ~1e-7 in size, so float32 on the GPU would snap their vertices to ~10cm
// steps. Instead the map centre is folded into the projection matrix and
// children are positioned relative to it: place objects at
// `mercator - origin`, read via useMapOrigin() inside useFrame.
const OriginContext = createContext<MutableRefObject<Origin> | null>(null)

export function useMapOrigin(): MutableRefObject<Origin> {
  const origin = useContext(OriginContext)
  if (!origin) throw new Error("useMapOrigin must be used inside <ThreeLayer>")
  return origin
}

type ThreeLayerProps = {
  map: maplibregl.Map | null
  children?: React.ReactNode
}

function CameraSync({ map, origin }: { map: maplibregl.Map | null; origin: MutableRefObject<Origin> }) {
  const { camera } = useThree()
  const mat = useMemo(() => new THREE.Matrix4(), [])
  const shift = useMemo(() => new THREE.Matrix4(), [])

  // Registered before any child, so it runs first each frame and children see
  // this frame's origin.
  useFrame(() => {
    if (!map) return
    const t = map.transform as unknown as MapTransformLike
    if (!t || !t.fovInRadians || !t.worldSize) return

    const center = lngLatToMercator(t.center)
    origin.current.x = center.x
    origin.current.y = center.y
    origin.current.worldSize = t.worldSize
    mat.copy(buildMercatorViewProjectionMatrix(t)).multiply(shift.makeTranslation(center.x, center.y, 0))
    camera.projectionMatrix.copy(mat)
    camera.matrixWorldAutoUpdate = false
    camera.matrixWorld.identity()
    camera.matrixWorldInverse.identity()
  })

  return null
}

export function ThreeLayer({ map, children }: ThreeLayerProps) {
  const origin = useRef<Origin>({ x: 0, y: 0, worldSize: 512 })
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <Canvas
        // R3F defaults its wrapper to pointer-events:auto (inline style),
        // which would cover the whole map and eat every click/drag once
        // this chunk loads. Force it through so the map stays interactive.
        // (We attach no handlers to 3D meshes, so nothing is lost.)
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        // A full-screen layer redrawn every frame over the map: cap its
        // resolution, and skip antialiasing on dense screens where jagged
        // edges are too small to see anyway.
        dpr={isLiteDevice() ? 1 : [1, 1.5]}
        gl={{ alpha: true, antialias: !isLiteDevice() && (typeof window === "undefined" || window.devicePixelRatio < 2) }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
        }}
      >
        <CameraSync map={map} origin={origin} />
        <OriginContext.Provider value={origin}>{children}</OriginContext.Provider>
      </Canvas>
    </div>
  )
}
