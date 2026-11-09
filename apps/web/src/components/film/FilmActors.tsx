"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { lngLatToMercator } from "@tiral/map"
import type { AvatarLoadout } from "@tiral/avatars"
import { useMapOrigin } from "@/components/ThreeLayer"
import { RealisticAvatar } from "@/components/RealisticAvatar"
import type { DanceFrame } from "@/lib/dance/moves"

// Life-size actors and props on the 3D map for the marketing films
// (marketing/trailer). Development only: a scene script sets
// window.__filmCast once (who's in it) and window.__filmShot every frame
// (where everyone is), in metres east (x) and south (y) of the cast's anchor.

export type FilmCast = {
  anchor: { lat: number; lng: number }
  actors: Array<{ id: string; loadout: AvatarLoadout; noBackpack?: boolean }>
  matatus: Array<{ id: string }>
}
export type FilmShot = {
  actors: Record<string, { x: number; y: number; heading: number; moving?: boolean; gait?: "walk" | "run"; posed?: DanceFrame | null; visible?: boolean }>
  matatus: Record<string, { x: number; y: number; heading: number; door: number }>
}

const EARTH = 2 * Math.PI * 6378137
const shot = (): FilmShot | undefined => (window as unknown as { __filmShot?: FilmShot }).__filmShot

export function FilmActors() {
  const [cast, setCast] = useState<FilmCast | null>(null)
  useEffect(() => {
    const read = () => setCast((window as unknown as { __filmCast?: FilmCast }).__filmCast ?? null)
    read()
    window.addEventListener("tiral:film-cast", read)
    return () => window.removeEventListener("tiral:film-cast", read)
  }, [])
  if (!cast) return null
  return <Stage cast={cast} />
}

function Stage({ cast }: { cast: FilmCast }) {
  const origin = useMapOrigin()
  const group = useRef<THREE.Group>(null)
  const mercator = useMemo(() => lngLatToMercator(cast.anchor), [cast.anchor])
  const scale = 1 / (EARTH * Math.cos((cast.anchor.lat * Math.PI) / 180))
  useFrame(() => {
    const g = group.current
    if (!g) return
    g.position.set(mercator.x - origin.current.x, mercator.y - origin.current.y, 0)
    g.scale.setScalar(scale)
  })
  return (
    <group ref={group}>
      <hemisphereLight args={["#FFF1DC", "#6B5A48", 1.5]} position={[0, 0, 1]} />
      <directionalLight position={[-40, -60, 80]} intensity={2.4} color="#FFE2B8" />
      {cast.actors.map((actor) => (
        <Actor key={actor.id} id={actor.id} loadout={actor.loadout} noBackpack={actor.noBackpack} />
      ))}
      {cast.matatus.map((m) => (
        <Matatu key={m.id} id={m.id} />
      ))}
    </group>
  )
}

function Actor({ id, loadout, noBackpack }: { id: string; loadout: AvatarLoadout; noBackpack?: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const posed = useRef<DanceFrame | null>(null)
  const [moving, setMoving] = useState(false)
  const [gait, setGait] = useState<"walk" | "run">("walk")
  useFrame(() => {
    const s = shot()?.actors[id]
    const g = ref.current
    if (!s || !g) return
    g.visible = s.visible ?? true
    g.position.set(s.x, s.y, 0)
    g.rotation.z = s.heading
    posed.current = s.posed ?? null
    if (Boolean(s.moving) !== moving) setMoving(Boolean(s.moving))
    if ((s.gait ?? "walk") !== gait) setGait(s.gait ?? "walk")
  })
  return (
    <group ref={ref}>
      {/* The map's y runs south: stand the model up and mirror it (as Avatar3D). */}
      <group rotation={[Math.PI / 2, 0, 0]} scale={[-1, 1, 1]}>
        <RealisticAvatar loadout={loadout} moving={moving} gait={gait} posed={posed} noBackpack={noBackpack} />
      </group>
    </group>
  )
}

/** A Kampala taxi: a white Hiace with the blue checker band and a sliding door (on its left, the kerb side). */
function Matatu({ id }: { id: string }) {
  const ref = useRef<THREE.Group>(null)
  const door = useRef<THREE.Mesh>(null)
  const band = useMemo(() => {
    const canvas = document.createElement("canvas")
    canvas.width = 256
    canvas.height = 32
    const ctx = canvas.getContext("2d")!
    for (let x = 0; x < 32; x++)
      for (let y = 0; y < 4; y++) {
        ctx.fillStyle = (x + y) % 2 ? "#1E56A8" : "#F8FAFC"
        ctx.fillRect(x * 8, y * 8, 8, 8)
      }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }, [])
  useFrame(() => {
    const s = shot()?.matatus[id]
    const g = ref.current
    if (!s || !g) return
    g.position.set(s.x, s.y, 0)
    g.rotation.z = s.heading
    // The door slides back along the body.
    if (door.current) door.current.position.x = 0.55 - s.door * 1.0
  })
  const white = <meshStandardMaterial color="#F4F4F2" roughness={0.45} metalness={0.15} />
  const glass = <meshStandardMaterial color="#26323C" roughness={0.15} metalness={0.4} />
  // Built along +x (front), width along y, up z; the map's y runs south, so the
  // vehicle's left side (doors) is at -y.
  return (
    <group ref={ref}>
      <mesh position={[0, 0, 1.15]}>
        <boxGeometry args={[4.7, 1.72, 1.6]} />
        {white}
      </mesh>
      <mesh position={[2.25, 0, 1.0]} rotation={[0, -0.25, 0]}>
        <boxGeometry args={[0.3, 1.7, 1.1]} />
        {white}
      </mesh>
      {/* Windows all round, windscreen. */}
      <mesh position={[-0.2, 0, 1.62]}>
        <boxGeometry args={[4.2, 1.74, 0.5]} />
        {glass}
      </mesh>
      <mesh position={[2.36, 0, 1.55]} rotation={[0, -0.45, 0]}>
        <boxGeometry args={[0.06, 1.55, 0.7]} />
        {glass}
      </mesh>
      {/* The checker band, both sides. */}
      {[-0.865, 0.865].map((y) => (
        <mesh key={y} position={[-0.1, y, 1.18]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[4.3, 0.2]} />
          <meshBasicMaterial map={band} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}
      {/* Doorway and the sliding door. */}
      <mesh position={[0.55, -0.866, 1.05]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.95, 1.5]} />
        <meshStandardMaterial color="#141414" side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={door} position={[0.55, -0.9, 1.15]}>
        <boxGeometry args={[0.98, 0.05, 1.6]} />
        {white}
      </mesh>
      {/* Wheels and lights. */}
      {[
        [1.55, 0.8],
        [1.55, -0.8],
        [-1.45, 0.8],
        [-1.45, -0.8]
      ].map(([x, y]) => (
        <mesh key={`${x}${y}`} position={[x!, y!, 0.33]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.33, 0.33, 0.22, 16]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
        </mesh>
      ))}
      {[-0.6, 0.6].map((y) => (
        <mesh key={y} position={[2.37, y, 0.75]}>
          <boxGeometry args={[0.05, 0.28, 0.16]} />
          <meshBasicMaterial color="#FFF4C2" toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
