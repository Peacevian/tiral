"use client"

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import { useFrame } from "@react-three/fiber"
import type * as THREE from "three"
import { KAMPALA_ZONE, haversineDistanceMeters, type LatLng } from "@tiral/game-core"
import { mercatorToLngLat, lngLatToMercator } from "@tiral/map"
import {
  CROWD_DROP_METERS,
  CROWD_POOL,
  busyStreet,
  crowdCount,
  crowdPlace,
  edgesNear,
  kampalaHour,
  separateCrowd,
  spawnCrowdPerson,
  stepCrowdPerson,
  type CrowdPerson,
  type RoadGraph
} from "@tiral/road-graph"
import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"
import { isLiteDevice } from "@/lib/deviceTier"
import { loadRoadGraph } from "@/lib/roadGraph"
import { useMapOrigin } from "@/components/ThreeLayer"
import { RealisticAvatar } from "@/components/RealisticAvatar"

// Same scale as the runner (Avatar3D), so the crowd reads as the same people.
const AVATAR_SCALE = 0.00000022
const AVATAR_HEIGHT = 1.85
const MIN_AVATAR_PX = 26
const EARTH = 2 * Math.PI * 6378137

function figureScale(worldSize: number) {
  return Math.max(AVATAR_SCALE, MIN_AVATAR_PX / (worldSize * AVATAR_HEIGHT))
}

/**
 * The walk clip is in-place, in model metres. On the map a person is drawn
 * many times life size, so the same pace has to cover that many real metres
 * or the legs walk while the body stays planted in the road.
 */
function roadSpeed(worldSize: number, pace: number) {
  return pace * figureScale(worldSize) * EARTH
}

// The Kyadondo crowd's clothes (VenuePeople): jerseys, hoodies, a kanzu, a gomesi.
const LOOKS: Array<Partial<AvatarLoadout>> = [
  { shirt: "#C8102E", outfit: "jersey" },
  { shirt: "#1E56A8" },
  { shirt: "#F2C14E", outfit: "cranes" },
  { shirt: "#2F7D4A", outfit: "hoodie" },
  { shirt: "#7C3AED" },
  { shirt: "#F5F5F4", outfit: "kanzu" },
  { shirt: "#E85F0C" },
  { shirt: "#0F172A", outfit: "tracksuit" },
  { shirt: "#EC4899", outfit: "gomesi" },
  { shirt: "#14B8A6" },
  { shirt: "#F59E0B", outfit: "hoodie" },
  { shirt: "#64748B" }
]

const BUSY = [KAMPALA_ZONE.bountyLocations[0]!, KAMPALA_ZONE.bountyLocations[1]!, KAMPALA_ZONE.bountyLocations[3]!].map(
  (place) => place.position
)

type Spot = { lat: number; lng: number; heading: number } | null

/**
 * One person on the street, the same body Kyadondo uses. Position is written
 * every frame by the crowd loop; this only draws it.
 */
function StreetPerson({ slot, places }: { slot: number; places: MutableRefObject<Spot[]> }) {
  const origin = useMapOrigin()
  const group = useRef<THREE.Group>(null)
  const loadout = useMemo(() => ({ ...DEFAULT_LOADOUT, ...LOOKS[slot % LOOKS.length] }) as AvatarLoadout, [slot])
  // Each body starts the walk cycle at a different step, so a group does not stride together.
  const phase = useMemo(() => ((slot * 0.6180339887) % 1) * Math.PI * 2, [slot])

  useFrame(() => {
    const node = group.current
    const spot = places.current[slot]
    if (!node) return
    if (!spot) {
      node.visible = false
      return
    }
    const point = lngLatToMercator(spot)
    node.visible = true
    node.position.set(point.x - origin.current.x, point.y - origin.current.y, 0)
    node.scale.setScalar(figureScale(origin.current.worldSize))
    node.rotation.z = spot.heading
  })

  return (
    <group ref={group} visible={false}>
      {/* Same stand-up and mirror as the runner, so the walk faces along the road. */}
      <group rotation={[Math.PI / 2, 0, 0]} scale={[-1, 1, 1]}>
        <RealisticAvatar loadout={loadout} moving gait="walk" phase={phase} />
      </group>
    </group>
  )
}

/**
 * People on the streets around the player. They walk the side of the road,
 * dressed like the Kyadondo crowd. Nothing here is sent to the server.
 */
export function StreetCrowd({ map, focus }: { map: maplibregl.Map | null; focus?: LatLng | null }) {
  const origin = useMapOrigin()
  const group = useRef<THREE.Group>(null)
  const graphRef = useRef<RoadGraph | null>(null)
  const people = useRef<(CrowdPerson | null)[]>(Array.from({ length: CROWD_POOL }, () => null))
  const places = useRef<Spot[]>(Array.from({ length: CROWD_POOL }, () => null))
  const options = useRef<string[]>([])
  const optionsAt = useRef<LatLng | null>(null)
  const focusRef = useRef(focus)
  focusRef.current = focus
  const lite = useMemo(() => isLiteDevice(), [])
  const [shown, setShown] = useState(0)
  const shownRef = useRef(0)

  useEffect(() => {
    let alive = true
    loadRoadGraph()
      .then((graph) => {
        if (alive) graphRef.current = graph
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  useFrame((_, delta) => {
    const graph = graphRef.current
    if (!graph || !map) return
    const worldSize = origin.current.worldSize
    if (worldSize <= 0) return

    const centre = focusRef.current ?? mercatorToLngLat({ x: origin.current.x, y: origin.current.y })
    const zoom = map.getZoom()
    const hour = kampalaHour(new Date())
    const want = crowdCount(zoom, lite, hour, busyStreet(centre, BUSY))
    if (shownRef.current !== want) {
      shownRef.current = want
      setShown(want)
    }

    const cached = optionsAt.current
    if (!cached || haversineDistanceMeters(cached, centre) > 25) {
      options.current = edgesNear(graph, centre)
      optionsAt.current = { lat: centre.lat, lng: centre.lng }
    }

    const now = performance.now() / 1000
    for (let slot = 0; slot < CROWD_POOL; slot++) {
      let person = people.current[slot] ?? null
      if (slot >= want) person = null
      else if (!person) person = spawnCrowdPerson(graph, options.current, slot, hour, centre)
      else {
        stepCrowdPerson(graph, person, delta, roadSpeed(worldSize, person.speed))
        const where = crowdPlace(graph, person)
        if (!where || haversineDistanceMeters(centre, where) > CROWD_DROP_METERS) {
          person = spawnCrowdPerson(graph, options.current, slot, hour + Math.floor(now), centre)
        }
      }
      people.current[slot] = person
    }
    separateCrowd(graph, people.current)
    for (let slot = 0; slot < CROWD_POOL; slot++) {
      const person = people.current[slot]
      places.current[slot] = person ? crowdPlace(graph, person) : null
    }
    // Below street zoom the pool is empty. Mark it still so the map can rest.
    if (group.current) group.current.userData.static = want === 0
  })

  return (
    <group ref={group}>
      {Array.from({ length: shown }, (_, slot) => (
        <StreetPerson key={slot} slot={slot} places={places} />
      ))}
    </group>
  )
}
