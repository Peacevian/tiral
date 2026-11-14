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
import {
  BACKPACK_COLORS,
  DEFAULT_LOADOUT,
  HAIR_COLORS,
  HAT_COLORS,
  PANTS_COLORS,
  SHIRT_COLORS,
  SHOE_COLORS,
  SKIN_TONES,
  type AvatarLoadout,
  type GlassesStyle,
  type HairStyle,
  type HatStyle,
  type Outfit
} from "@tiral/avatars"
import { isLiteDevice } from "@/lib/deviceTier"
import { loadRoadGraph } from "@/lib/roadGraph"
import { useMapOrigin } from "@/components/ThreeLayer"
import { RealisticAvatar } from "@/components/RealisticAvatar"

// The runner's scale (Avatar3D): drawn larger than life so they read on the map.
const AVATAR_SCALE = 0.00000022
const AVATAR_HEIGHT = 1.85
const MIN_AVATAR_PX = 26
const EARTH = 2 * Math.PI * 6378137
/** Passers-by are drawn smaller than the runner, so the player stands out. */
const CROWD_SIZE = 0.6
/**
 * A stroll, not a march: the walk clip plays this much slower than made and
 * the ground goes by as much slower, so the feet still don't slide.
 */
const STROLL = 0.6
/** Model metres a second the walk clip covers at its own speed. */
const CLIP_PACE = 1.2
/** Newcomers (after the first fill) appear out of sight, this far from the player. */
const FRESH_NEAR_METERS = 60
const FRESH_FAR_METERS = 220
/** Margin (px) beyond the screen's edge that still counts as in view. */
const VIEW_MARGIN = 60

function figureScale(worldSize: number) {
  return Math.max(AVATAR_SCALE, MIN_AVATAR_PX / (worldSize * AVATAR_HEIGHT)) * CROWD_SIZE
}

/**
 * The walk clip is in-place, in model metres. On the map a person is drawn
 * many times life size, so the same pace has to cover that many real metres
 * or the legs walk while the body stays planted in the road.
 */
function roadSpeed(worldSize: number, pace: number) {
  return pace * figureScale(worldSize) * EARTH * STROLL
}

/** A repeatable 0–1 roll from a person's look, one per `key`. */
function roll(look: number, key: number): number {
  let x = Math.imul(Math.floor(look * 2 ** 31) ^ Math.imul(key + 1, 0x9e3779b1), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/** One of `options` by weight. */
function weighted<T>(r: number, options: ReadonlyArray<readonly [T, number]>): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0)
  let left = r * total
  for (const [value, weight] of options) {
    left -= weight
    if (left < 0) return value
  }
  return options[options.length - 1]![0]
}

const pick = <T,>(r: number, list: readonly T[]): T => list[Math.floor(r * list.length) % list.length]!

/**
 * Who someone on a Kampala street is: men and women, mostly darker skin,
 * everyday clothes (a shirt or tee most days; now and then kitenge, a hoodie,
 * a football shirt, a kanzu or gomesi), the odd hat, glasses or backpack.
 */
export function crowdLook(look: number): { loadout: AvatarLoadout; backpack: boolean } {
  const woman = roll(look, 1) < 0.5
  const hair = weighted<HairStyle>(
    roll(look, 2),
    woman
      ? [["braids", 35], ["afro", 30], ["short", 25], ["locs", 10]]
      : [["short", 35], ["fade", 30], ["bald", 25], ["locs", 10]]
  )
  const hat = weighted<HatStyle>(
    roll(look, 3),
    woman
      ? [["none", 84], ["headwrap", 10], ["cap", 4], ["beanie", 2]]
      : [["none", 82], ["cap", 11], ["safari", 3], ["beanie", 4]]
  )
  const outfit = weighted<Outfit>(
    roll(look, 4),
    woman
      ? [["shirt", 78], ["kitenge", 8], ["gomesi", 6], ["hoodie", 5], ["jersey", 3]]
      : [["shirt", 82], ["hoodie", 6], ["jersey", 5], ["kitenge", 4], ["kanzu", 3]]
  )
  const glasses = weighted<GlassesStyle>(roll(look, 5), [["none", 94], ["round", 3], ["square", 3]])
  // Skin tones run light to dark; Kampala's streets are mostly the darker two.
  const skin = weighted(roll(look, 6), SKIN_TONES.map((tone, i) => [tone, [3, 7, 20, 35, 35][i]!] as const))
  return {
    loadout: {
      ...DEFAULT_LOADOUT,
      body: woman ? "female" : "male",
      skin,
      shirt: pick(roll(look, 7), SHIRT_COLORS),
      // Mostly navy, black and denim; the odd brown, green or maroon.
      pants: weighted(roll(look, 8), PANTS_COLORS.map((colour, i) => [colour, [32, 30, 5, 18, 10, 5][i]!] as const)),
      // Mostly dark or white shoes.
      shoes: weighted(roll(look, 9), SHOE_COLORS.map((colour, i) => [colour, [42, 30, 7, 9, 6, 6][i]!] as const)),
      hair,
      // Mostly black and dark brown; a few dyed.
      hairColor: roll(look, 10) < 0.9 ? pick(roll(look, 11), HAIR_COLORS.slice(0, 3)) : pick(roll(look, 11), HAIR_COLORS),
      hat,
      hatColor: pick(roll(look, 12), HAT_COLORS),
      glasses,
      outfit,
      backpack: pick(roll(look, 13), BACKPACK_COLORS),
      trail: "none"
    },
    backpack: roll(look, 14) < 0.15
  }
}

const BUSY = [KAMPALA_ZONE.bountyLocations[0]!, KAMPALA_ZONE.bountyLocations[1]!, KAMPALA_ZONE.bountyLocations[3]!].map(
  (place) => place.position
)

type Spot = { lat: number; lng: number; heading: number } | null
/** Who stands in a slot: their look and pace (changes only when the slot gets a new person). */
type Face = { look: number; pace: number } | null

/**
 * One person on the street. Position is written every frame by the crowd
 * loop; this only draws it.
 */
function StreetPerson({ slot, face, places }: { slot: number; face: { look: number; pace: number }; places: MutableRefObject<Spot[]> }) {
  const origin = useMapOrigin()
  const group = useRef<THREE.Group>(null)
  const { loadout, backpack } = useMemo(() => crowdLook(face.look), [face.look])
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
        <RealisticAvatar loadout={loadout} moving gait="walk" phase={phase} noBackpack={!backpack} timeScale={(face.pace / CLIP_PACE) * STROLL} />
      </group>
    </group>
  )
}

/**
 * People on the streets around the player: Kampala's everyday crowd at the
 * roadside. Nothing here is sent to the server.
 */
export function StreetCrowd({ map, focus }: { map: maplibregl.Map | null; focus?: LatLng | null }) {
  const origin = useMapOrigin()
  const group = useRef<THREE.Group>(null)
  const graphRef = useRef<RoadGraph | null>(null)
  const people = useRef<(CrowdPerson | null)[]>(Array.from({ length: CROWD_POOL }, () => null))
  const places = useRef<Spot[]>(Array.from({ length: CROWD_POOL }, () => null))
  // Roads to put people on: around the player for the first fill, and out of
  // sight for everyone after.
  const options = useRef<{ fill: string[]; fresh: string[] }>({ fill: [], fresh: [] })
  const optionsAt = useRef<{ centre: LatLng; time: number } | null>(null)
  const focusRef = useRef(focus)
  focusRef.current = focus
  const lite = useMemo(() => isLiteDevice(), [])
  const [faces, setFaces] = useState<Face[]>(() => Array.from({ length: CROWD_POOL }, () => null))
  const facesRef = useRef(faces)
  // The crowd fills in around the player only when it first appears.
  const filling = useRef(true)

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
    // Gone (zoomed out): fill around the player again when it comes back.
    if (want === 0) filling.current = true

    // Refresh the road choices after moving 25 m, and every 2 s as the camera turns.
    const now = performance.now()
    const cached = optionsAt.current
    if (!cached || haversineDistanceMeters(cached.centre, centre) > 25 || now - cached.time > 2000) {
      const canvas = map.getCanvas()
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const outOfSight = (edgeId: string) => {
        const edge = graph.edges[edgeId]!
        const mid = { lng: (edge.coordinates[0].lng + edge.coordinates[1].lng) / 2, lat: (edge.coordinates[0].lat + edge.coordinates[1].lat) / 2 }
        const p = map.project([mid.lng, mid.lat])
        return p.x < -VIEW_MARGIN || p.x > width + VIEW_MARGIN || p.y < -VIEW_MARGIN || p.y > height + VIEW_MARGIN
      }
      options.current = {
        fill: edgesNear(graph, centre),
        fresh: edgesNear(graph, centre, FRESH_NEAR_METERS, FRESH_FAR_METERS).filter(outOfSight)
      }
      optionsAt.current = { centre: { lat: centre.lat, lng: centre.lng }, time: now }
    }

    const salt = hour + Math.floor(now / 1000)
    const roads = () => (filling.current || options.current.fresh.length === 0 ? options.current.fill : options.current.fresh)
    let changed = false
    for (let slot = 0; slot < CROWD_POOL; slot++) {
      let person = people.current[slot] ?? null
      if (slot >= want) person = null
      else if (!person) person = spawnCrowdPerson(graph, roads(), slot, salt, centre)
      else {
        stepCrowdPerson(graph, person, delta, roadSpeed(worldSize, person.speed))
        const where = crowdPlace(graph, person)
        if (!where || haversineDistanceMeters(centre, where) > CROWD_DROP_METERS) {
          person = spawnCrowdPerson(graph, roads(), slot, salt, centre)
        }
      }
      people.current[slot] = person
      const face = facesRef.current[slot]
      if ((face?.look ?? null) !== (person?.look ?? null)) changed = true
    }
    if (want > 0) filling.current = false
    separateCrowd(graph, people.current)
    for (let slot = 0; slot < CROWD_POOL; slot++) {
      const person = people.current[slot]
      places.current[slot] = person ? crowdPlace(graph, person) : null
    }
    // New people in some slots: draw them (rare; most frames change nothing).
    if (changed) {
      const next = people.current.map((person) => (person ? { look: person.look, pace: person.speed } : null))
      facesRef.current = next
      setFaces(next)
    }
    // Below street zoom the pool is empty. Mark it still so the map can rest.
    if (group.current) group.current.userData.static = want === 0
  })

  return (
    <group ref={group}>
      {faces.map((face, slot) => (face ? <StreetPerson key={`${slot}-${face.look}`} slot={slot} face={face} places={places} /> : null))}
    </group>
  )
}
