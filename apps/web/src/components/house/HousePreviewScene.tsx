"use client"

import { useMemo } from "react"
import { Canvas } from "@react-three/fiber"
import { Environment, Lightformer, OrbitControls } from "@react-three/drei"
import type { HouseLoadout, PlacedItem } from "@tiral/houses"
import { FURNITURE_BY_ID, ROOM_GRID } from "@tiral/houses"
import { Furniture3D } from "./Furniture3D"
import { makeMaterialTexture, materialSurface } from "./houseTextures"

const HALF = ROOM_GRID / 2
const WALL_HEIGHT = 2.5
const WALL_THICKNESS = 0.15

function itemTransform(item: PlacedItem) {
  const spec = FURNITURE_BY_ID[item.item]
  const swapped = item.rot === 90 || item.rot === 270
  const w = swapped ? spec.depth : spec.width
  const d = swapped ? spec.width : spec.depth
  return {
    position: [item.x + w / 2 - HALF, 0, item.z + d / 2 - HALF] as [number, number, number],
    rotationY: (item.rot * Math.PI) / 180
  }
}

function Wall({
  position,
  size,
  color,
  texture,
  ...surface
}: {
  position: [number, number, number]
  size: [number, number, number]
  color: string
  texture: ReturnType<typeof makeMaterialTexture>
  roughness: number
  metalness: number
}) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial
        map={texture ?? undefined}
        color={color}
        roughness={surface.roughness}
        metalness={surface.metalness}
      />
    </mesh>
  )
}

function Room({ house, showRoof }: { house: HouseLoadout; showRoof: boolean }) {
  const wallTex = useMemo(() => makeMaterialTexture(house.wallMaterial, 3), [house.wallMaterial])
  const floorTex = useMemo(() => makeMaterialTexture(house.floorMaterial, 4), [house.floorMaterial])
  const roofTex = useMemo(() => makeMaterialTexture(house.roofMaterial, 3), [house.roofMaterial])
  const wall = materialSurface(house.wallMaterial)
  const floor = materialSurface(house.floorMaterial)
  const roof = materialSurface(house.roofMaterial)

  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[ROOM_GRID, ROOM_GRID]} />
        <meshStandardMaterial
          map={floorTex ?? undefined}
          color={house.colors.floor}
          roughness={floor.roughness}
          metalness={floor.metalness}
        />
      </mesh>

      {/* plinth + trim */}
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <boxGeometry args={[ROOM_GRID + 0.4, 0.24, ROOM_GRID + 0.4]} />
        <meshStandardMaterial color={house.colors.trim} roughness={0.8} />
      </mesh>

      {/* back wall (+z viewer, so wall at -z) */}
      <Wall
        position={[0, WALL_HEIGHT / 2, -HALF]}
        size={[ROOM_GRID, WALL_HEIGHT, WALL_THICKNESS]}
        color={house.colors.wall}
        texture={wallTex}
        roughness={wall.roughness}
        metalness={wall.metalness}
      />
      {/* left wall (at -x) */}
      <Wall
        position={[-HALF, WALL_HEIGHT / 2, 0]}
        size={[WALL_THICKNESS, WALL_HEIGHT, ROOM_GRID]}
        color={house.colors.wall}
        texture={wallTex}
        roughness={wall.roughness}
        metalness={wall.metalness}
      />
      {/* skirting trim */}
      <mesh position={[0, 0.12, -HALF + WALL_THICKNESS / 2 + 0.01]}>
        <boxGeometry args={[ROOM_GRID, 0.24, 0.04]} />
        <meshStandardMaterial color={house.colors.trim} roughness={0.7} />
      </mesh>
      <mesh position={[-HALF + WALL_THICKNESS / 2 + 0.01, 0.12, 0]}>
        <boxGeometry args={[0.04, 0.24, ROOM_GRID]} />
        <meshStandardMaterial color={house.colors.trim} roughness={0.7} />
      </mesh>

      {showRoof && (
        <mesh position={[0, WALL_HEIGHT + 0.12, 0]} castShadow receiveShadow>
          <boxGeometry args={[ROOM_GRID + 0.5, 0.24, ROOM_GRID + 0.5]} />
          <meshStandardMaterial
            map={roofTex ?? undefined}
            color={house.colors.roof}
            roughness={roof.roughness}
            metalness={roof.metalness}
          />
        </mesh>
      )}

      {house.items.map((item) => {
        const { position, rotationY } = itemTransform(item)
        return (
          <group key={item.id} position={position} rotation={[0, rotationY, 0]}>
            <Furniture3D spec={FURNITURE_BY_ID[item.item]} color={item.color} />
          </group>
        )
      })}
    </group>
  )
}

export function HousePreviewScene({
  house,
  showRoof = false
}: {
  house: HouseLoadout
  showRoof?: boolean
}) {
  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      camera={{ position: [7.5, 6.5, 8.5], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      shadows
    >
      <hemisphereLight args={["#fff4d6", "#293548", 0.6]} />
      <directionalLight
        position={[6, 10, 6]}
        intensity={2.2}
        color="#fff1d6"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-6, 5, -4]} intensity={0.5} color="#bcd3ff" />
      <Environment resolution={256}>
        <group rotation={[-Math.PI / 3, 0, 1]}>
          <Lightformer form="circle" intensity={5} position={[0, 6, -8]} scale={2} />
          <Lightformer form="rect" intensity={2} position={[-6, 2, -1]} scale={[3, 0.8, 1]} />
          <Lightformer form="rect" intensity={2} position={[6, -1, -1]} scale={[3, 0.8, 1]} color="#bcd3ff" />
        </group>
      </Environment>
      {/* ground plane outside the house */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.24, 0]} receiveShadow>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial color="#0f1a2b" roughness={1} />
      </mesh>
      <Room house={house} showRoof={showRoof} />
      <OrbitControls
        target={[0, 0.8, 0]}
        enablePan={false}
        minDistance={6}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2 + 0.05}
        autoRotate
        autoRotateSpeed={0.9}
      />
    </Canvas>
  )
}
