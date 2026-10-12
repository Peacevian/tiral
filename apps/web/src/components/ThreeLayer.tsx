"use client"

import { useMemo } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { buildMercatorViewProjectionMatrix } from "@tiral/map"
import type { MapTransformLike } from "@tiral/map"

type ThreeLayerProps = {
  map: maplibregl.Map | null
  children?: React.ReactNode
}

function CameraSync({ map }: { map: maplibregl.Map | null }) {
  const { camera } = useThree()
  const mat = useMemo(() => new THREE.Matrix4(), [])

  useFrame(() => {
    if (!map) return
    const t = map.transform as unknown as MapTransformLike
    if (!t || !t.fovInRadians || !t.worldSize) return

    mat.copy(buildMercatorViewProjectionMatrix(t))
    camera.projectionMatrix.copy(mat)
    camera.matrixWorldAutoUpdate = false
    camera.matrixWorld.identity()
    camera.matrixWorldInverse.identity()
  })

  return null
}

export function ThreeLayer({ map, children }: ThreeLayerProps) {
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <Canvas
        // R3F defaults its wrapper to pointer-events:auto (inline style),
        // which would cover the whole map and eat every click/drag once
        // this chunk loads. Force it through so the map stays interactive.
        // (We attach no handlers to 3D meshes, so nothing is lost.)
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
        }}
      >
        <CameraSync map={map} />
        {children}
      </Canvas>
    </div>
  )
}
