"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { Environment, Lightformer, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import type { HouseLoadout, PlacedItem } from "@tiral/houses"
import type { AvatarLoadout } from "@tiral/avatars"
import { FURNITURE_BY_ID, ROOM_GRID } from "@tiral/houses"
import { Furniture3D } from "./Furniture3D"
import { RealisticAvatar } from "../RealisticAvatar"
import { makeMaterialTexture, materialSurface } from "./houseTextures"

import { AVATAR_HOME, type HouseView, type RoomSpot } from "./roomSpots"
import { sceneQuality } from "@/lib/deviceTier"

export { AVATAR_HOME, type HouseView, type RoomSpot }

const OUTSIDE_CAMERA: [number, number, number] = [7.5, 6.5, 8.5]
const OUTSIDE_TARGET: [number, number, number] = [0, 0.8, 0]
const INSIDE_CAMERA: [number, number, number] = [2.6, 2.1, 4.8]
const INSIDE_TARGET: [number, number, number] = [0, 1.0, -0.5]

function CameraRig({ view, follow }: { view: HouseView; follow: RoomSpot | null }) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as unknown as {
    target: THREE.Vector3
    update(): void
  } | null
  useEffect(() => {
    if (view === "inside") {
      camera.position.set(...INSIDE_CAMERA)
      controls?.target.set(...INSIDE_TARGET)
    } else {
      camera.position.set(...OUTSIDE_CAMERA)
      controls?.target.set(...OUTSIDE_TARGET)
    }
    controls?.update()
  }, [view, camera, controls])
  // Gentle follow while strolling inside: glide the orbit target, never the camera.
  useFrame((_, delta) => {
    if (!controls || view !== "inside" || !follow) return
    const t = controls.target
    const k = 1 - Math.exp(-3 * delta)
    t.x += (follow.x - t.x) * k
    t.z += (follow.z - t.z) * k
  })
  return null
}

// Ignore orbit drags: only near-stationary taps count (mirrors map click tolerance).
function tapped(event: ThreeEvent<MouseEvent>): boolean {
  return event.delta <= 6
}

function SelectionRing({ spot }: { spot: RoomSpot }) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.08
    ref.current?.scale.set(s, s, 1)
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[spot.x, 0.03, spot.z]}>
      <ringGeometry args={[0.32, 0.46, 32]} />
      <meshBasicMaterial color="#E85F0C" transparent opacity={0.9} side={THREE.DoubleSide} />
    </mesh>
  )
}

const STROLL_SPEED = 2.2

function StrollingAvatar({
  loadout,
  spot,
  onTap
}: {
  loadout: AvatarLoadout
  spot: RoomSpot
  onTap(): void
}) {
  const group = useRef<THREE.Group>(null)
  const current = useRef<RoomSpot>({ ...spot })
  const strollingRef = useRef(false)
  const [strolling, setStrolling] = useState(false)
  useFrame((_, delta) => {
    const dx = spot.x - current.current.x
    const dz = spot.z - current.current.z
    const dist = Math.hypot(dx, dz)
    if (dist > 0.02) {
      const step = Math.min(dist, STROLL_SPEED * delta)
      current.current.x += (dx / dist) * step
      current.current.z += (dz / dist) * step
      group.current?.rotation.set(0, Math.atan2(dx, dz), 0)
      if (!strollingRef.current) {
        strollingRef.current = true
        setStrolling(true)
      }
    } else if (strollingRef.current) {
      strollingRef.current = false
      setStrolling(false)
    }
    group.current?.position.set(current.current.x, 0, current.current.z)
  })
  return (
    <group
      ref={group}
      onClick={(event) => {
        if (!tapped(event)) return
        event.stopPropagation()
        onTap()
      }}
    >
      <RealisticAvatar loadout={loadout} moving={strolling} />
    </group>
  )
}

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

function Room({
  house,
  showRoof,
  onSelectTile,
  onSelectSurface
}: {
  house: HouseLoadout
  showRoof: boolean
  onSelectTile(x: number, z: number): void
  onSelectSurface(kind: "wall" | "roof"): void
}) {
  const tileFromPoint = (point: THREE.Vector3) => {
    const tx = Math.max(0, Math.min(ROOM_GRID - 1, Math.floor(point.x + HALF)))
    const tz = Math.max(0, Math.min(ROOM_GRID - 1, Math.floor(point.z + HALF)))
    return { x: tx + 0.5 - HALF, z: tz + 0.5 - HALF }
  }
  const wallTex = useMemo(() => makeMaterialTexture(house.wallMaterial, 3), [house.wallMaterial])
  const floorTex = useMemo(() => makeMaterialTexture(house.floorMaterial, 4), [house.floorMaterial])
  const roofTex = useMemo(() => makeMaterialTexture(house.roofMaterial, 3), [house.roofMaterial])
  const wall = materialSurface(house.wallMaterial)
  const floor = materialSurface(house.floorMaterial)
  const roof = materialSurface(house.roofMaterial)

  return (
    <group>
      {/* floor (tap = stroll there) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        receiveShadow
        onClick={(event) => {
          if (!tapped(event)) return
          const tile = tileFromPoint(event.point)
          onSelectTile(tile.x, tile.z)
        }}
      >
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
      <group
        onClick={(event) => {
          if (!tapped(event)) return
          event.stopPropagation()
          onSelectSurface("wall")
        }}
      >
        <Wall
          position={[0, WALL_HEIGHT / 2, -HALF]}
          size={[ROOM_GRID, WALL_HEIGHT, WALL_THICKNESS]}
          color={house.colors.wall}
          texture={wallTex}
          roughness={wall.roughness}
          metalness={wall.metalness}
        />
      </group>
      {/* left wall (at -x) */}
      <group
        onClick={(event) => {
          if (!tapped(event)) return
          event.stopPropagation()
          onSelectSurface("wall")
        }}
      >
        <Wall
          position={[-HALF, WALL_HEIGHT / 2, 0]}
          size={[WALL_THICKNESS, WALL_HEIGHT, ROOM_GRID]}
          color={house.colors.wall}
          texture={wallTex}
          roughness={wall.roughness}
          metalness={wall.metalness}
        />
      </group>
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
        <mesh
          position={[0, WALL_HEIGHT + 0.12, 0]}
          castShadow
          receiveShadow
          onClick={(event) => {
            if (!tapped(event)) return
            event.stopPropagation()
            onSelectSurface("roof")
          }}
        >
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
  showRoof = false,
  view = "outside",
  avatarLoadout,
  avatarSpot = AVATAR_HOME,
  selection = null,
  onSelectTile,
  onSelectAvatar,
  onSelectSurface,
  paused = false
}: {
  house: HouseLoadout
  showRoof?: boolean
  view?: HouseView
  /** When set, the avatar lives inside the room (the profile hero). */
  avatarLoadout?: AvatarLoadout
  avatarSpot?: RoomSpot
  selection?: RoomSpot | null
  onSelectTile?(x: number, z: number): void
  onSelectAvatar?(): void
  onSelectSurface?(kind: "wall" | "roof"): void
  paused?: boolean
}) {
  const inside = view === "inside"
  // Lighter on low-end / slow phones (no shadows, 1× pixels): lib/deviceTier.ts
  const quality = sceneQuality()
  return (
    <Canvas
      style={{ width: "100%", height: "100%" }}
      camera={{ position: OUTSIDE_CAMERA, fov: 42 }}
      gl={{ antialias: quality.antialias, alpha: true }}
      dpr={quality.dpr}
      shadows={quality.shadows}
      frameloop={paused ? "never" : "always"}
    >
      <CameraRig view={view} follow={avatarLoadout ? avatarSpot : null} />
      <hemisphereLight args={["#fff4d6", "#b9c9a6", 0.8]} />
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
      {/* ground plane outside the house: daytime grass */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.24, 0]} receiveShadow>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial color="#B7CF9F" roughness={1} />
      </mesh>
      <Room
        house={house}
        showRoof={showRoof && !inside}
        onSelectTile={(x, z) => onSelectTile?.(x, z)}
        onSelectSurface={(kind) => onSelectSurface?.(kind)}
      />
      {selection && <SelectionRing spot={selection} />}
      {avatarLoadout && (
        <StrollingAvatar
          loadout={avatarLoadout}
          spot={avatarSpot}
          onTap={() => onSelectAvatar?.()}
        />
      )}
      <OrbitControls
        makeDefault
        target={inside ? INSIDE_TARGET : OUTSIDE_TARGET}
        enablePan={false}
        minDistance={inside ? 2 : 6}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2 + 0.05}
        autoRotate={!inside}
        autoRotateSpeed={0.9}
      />
    </Canvas>
  )
}
