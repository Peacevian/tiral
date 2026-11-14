import { haversineDistanceMeters, type LatLng } from "@tiral/game-core"
import {
  chooseBestEdge,
  classifyConnectedEdges,
  enterEdgeFrom,
  getRoadCoordinate,
  getRoadHeading,
  type RoadEdge,
  type RoadGraph,
  type RoadPosition
} from "./index"

// People drawn on the street around the player. Visual only: the phone
// invents them, they walk the road graph, and they never join a race or
// block the runner. They keep to the roadside: how far out depends on the
// road's class (OpenStreetMap has no widths here), so a wide avenue's walkers
// are well off its centre line and a lane's stay inside it.

export const CROWD_POOL = 24
/** Spawn between these distances so nobody pops out of the runner. */
export const CROWD_SPAWN_NEAR_METERS = 18
export const CROWD_SPAWN_FAR_METERS = 80
/**
 * Past this, a person is put back on a road near the player. Wide enough that
 * they can walk down the avenue in view before they are recycled.
 */
export const CROWD_DROP_METERS = 600

export type CrowdPerson = {
  edgeId: string
  distance: number
  direction: 1 | -1
  /** +1 is to the right of travel, -1 to the left. */
  side: 1 | -1
  /** Compass heading they keep. Stops a junction sweeping everyone the same way. */
  headingPref: number
  /** 0: right at the road's edge; 1: a little further in (see roadsideOffset). */
  lane: number
  speed: number
  /** Walk-cycle offset, radians. */
  phase: number
  /** Below 0.34, the next junction is a turn onto another street. */
  wander: number
  /** 0–1: who they are (the drawing turns it into a body and clothes). */
  look: number
}

/** Half a road's width by its class, in metres (rough Kampala widths, edge to edge). */
const HALF_WIDTH: Record<string, number> = {
  trunk: 6,
  trunk_link: 4,
  primary: 5.5,
  primary_link: 4,
  secondary: 4.5,
  secondary_link: 3.5,
  tertiary: 4,
  tertiary_link: 3.2,
  residential: 3.2,
  unclassified: 3.2,
  service: 2.3,
  pedestrian: 2.5,
  footway: 1,
  path: 1,
  steps: 1
}

/** How far from the centre line someone walks: inside the edge, by `lane`. */
export function roadsideOffset(highway: string, lane: number): number {
  const half = HALF_WIDTH[highway] ?? 3
  return Math.max(0.3, half - 0.6 - lane * 0.9)
}

/** Hour in Kampala (UTC+3, no daylight saving). */
export function kampalaHour(now: Date): number {
  return (now.getUTCHours() + 3) % 24
}

/**
 * How many people to draw. None on the city view (below zoom 16). Cheap
 * phones stay at 10. Evenings and the busy places are fuller, still inside
 * the pool.
 */
export function crowdCount(zoom: number, lite: boolean, hour: number, busy: boolean): number {
  if (zoom < 16) return 0
  const base = zoom >= 17 ? 24 : 12
  let factor = 0.7
  if (hour >= 17 || hour < 1) factor = 1
  else if (hour < 7) factor = 0.45
  else if (hour >= 14) factor = 0.85
  if (busy) factor *= 1.35
  const cap = lite ? 10 : CROWD_POOL
  const floor = lite ? 4 : 6
  return Math.max(floor, Math.min(cap, Math.round(base * factor)))
}

/** True when `point` is within `radiusMeters` of any of `places`. */
export function busyStreet(point: LatLng, places: readonly LatLng[], radiusMeters = 200): boolean {
  return places.some((place) => haversineDistanceMeters(point, place) <= radiusMeters)
}

function unit(salt: number, slot: number): number {
  let x = Math.imul(salt ^ Math.imul(slot + 1, 0x9e3779b1), 0x7feb352d)
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/** Edge ids whose midpoint lies in a ring around `focus` (by default the spawn ring). */
export function edgesNear(graph: RoadGraph, focus: LatLng, near = CROWD_SPAWN_NEAR_METERS, far = CROWD_SPAWN_FAR_METERS): string[] {
  const ids: string[] = []
  for (const edge of Object.values(graph.edges)) {
    if (edge.lengthMeters < 4) continue
    const mid = {
      lat: (edge.coordinates[0].lat + edge.coordinates[1].lat) / 2,
      lng: (edge.coordinates[0].lng + edge.coordinates[1].lng) / 2
    }
    const distance = haversineDistanceMeters(focus, mid)
    if (distance >= near && distance <= far) ids.push(edge.id)
  }
  return ids
}

/** A distance along `edge` that lands in the spawn ring around `focus`. */
function distanceNear(edge: RoadEdge, focus: LatLng, roll: number): number {
  let best = roll * edge.lengthMeters
  let bestScore = Infinity
  for (const t of [0.15, 0.35, 0.55, 0.75, 0.9]) {
    const point = {
      lat: edge.coordinates[0].lat + (edge.coordinates[1].lat - edge.coordinates[0].lat) * t,
      lng: edge.coordinates[0].lng + (edge.coordinates[1].lng - edge.coordinates[0].lng) * t
    }
    const distance = haversineDistanceMeters(focus, point)
    if (distance < CROWD_SPAWN_NEAR_METERS || distance > CROWD_SPAWN_FAR_METERS) continue
    const score = Math.abs(distance - 40)
    if (score < bestScore) {
      best = t * edge.lengthMeters
      bestScore = score
    }
  }
  return best
}

/** A person on a road in `options` (or null when the ring is empty). */
export function spawnCrowdPerson(
  graph: RoadGraph,
  options: readonly string[],
  slot: number,
  salt: number,
  focus?: LatLng
): CrowdPerson | null {
  if (options.length === 0) return null
  // Each person picks their own street and their own way along it.
  const edge = graph.edges[options[Math.floor(unit(salt, slot) * options.length) % options.length]!]
  if (!edge) return null
  const roll = unit(salt, slot + 17)
  const direction: 1 | -1 = unit(salt, slot + 3) < 0.5 ? 1 : -1
  return {
    edgeId: edge.id,
    distance: focus ? distanceNear(edge, focus, roll) : roll * edge.lengthMeters,
    direction,
    headingPref: getRoadHeading(graph, { edgeId: edge.id, distanceAlongEdge: 0, direction }),
    side: direction,
    lane: unit(salt, slot + 9),
    speed: 0.7 + unit(salt, slot + 11) * 1,
    phase: unit(salt, slot + 13) * Math.PI * 2,
    wander: unit(salt, slot + 23),
    look: unit(salt, slot + 19)
  }
}

/**
 * Leave `nodeId` along the road that continues ahead. A bend is followed.
 * Turning back only happens when the street actually ends, so people do not
 * twitch on every corner.
 */
function leaveJunction(graph: RoadGraph, person: CrowdPerson, nodeId: string, overflow: number): RoadPosition | null {
  const edge = graph.edges[person.edgeId]
  if (!edge) return null
  const probe: RoadPosition = {
    edgeId: person.edgeId,
    distanceAlongEdge: person.direction === 1 ? edge.lengthMeters : 0,
    direction: person.direction
  }
  const candidates = classifyConnectedEdges(graph, probe)
  if (candidates.length === 0) return null
  const straight = chooseBestEdge(candidates, null)
  // About one junction in three, take a different street. The roll is fixed
  // for this corner, so the choice does not flicker from frame to frame.
  let salt = Math.round(person.wander * 1e6)
  for (let i = 0; i < nodeId.length; i++) salt = Math.imul(salt ^ nodeId.charCodeAt(i), 0x9e3779b1)
  const turn = candidates.length > 1 && person.wander < 0.34
    ? candidates[Math.floor(unit(salt, 2) * candidates.length) % candidates.length]!
    : straight
  if (!turn) return null
  return enterEdgeFrom(graph, turn.edgeId, nodeId, overflow)
}

/** How far apart two people going the same way should stay, in metres. */
const PERSONAL_SPACE = 4

/**
 * Hold a person back when someone is walking just ahead on the same street.
 * This is the one-dimensional form of a social-force gap: nobody shares a body.
 */
export function separateCrowd(graph: RoadGraph, people: readonly (CrowdPerson | null)[]): void {
  for (let i = 0; i < people.length; i++) {
    const person = people[i]
    if (!person) continue
    const edge = graph.edges[person.edgeId]
    if (!edge) continue
    let nearest = Infinity
    let blocker: CrowdPerson | null = null
    for (let j = 0; j < people.length; j++) {
      if (i === j) continue
      const other = people[j]
      if (!other || other.edgeId !== person.edgeId || other.direction !== person.direction) continue
      // A tiny index bias breaks an exact tie, so one of them is "ahead".
      const mine = person.distance + i * 0.02
      const theirs = other.distance + j * 0.02
      const gap = person.direction === 1 ? theirs - mine : mine - theirs
      if (gap > 0 && gap < nearest) {
        nearest = gap
        blocker = other
      }
    }
    if (!blocker || nearest >= PERSONAL_SPACE) continue
    person.distance = person.direction === 1
      ? Math.max(0, blocker.distance - PERSONAL_SPACE)
      : Math.min(edge.lengthMeters, blocker.distance + PERSONAL_SPACE)
  }
}

/**
 * Walk `person` for `dt` seconds. `speed` is metres per second along the road
 * (defaults to the person's own pace). At a dead end they turn around.
 */
export function stepCrowdPerson(graph: RoadGraph, person: CrowdPerson, dt: number, speed = person.speed): void {
  const edge = graph.edges[person.edgeId]
  if (!edge || edge.lengthMeters <= 0) return
  // A long frame must not throw them through a block.
  const step = Math.min(4, Math.max(0, speed) * Math.max(0, dt))
  if (person.direction === 1) {
    const next = person.distance + step
    if (next <= edge.lengthMeters) {
      person.distance = next
      return
    }
    const entered = leaveJunction(graph, person, edge.toNodeId, next - edge.lengthMeters)
    if (!entered) {
      person.direction = -1
      person.distance = edge.lengthMeters
      return
    }
    person.edgeId = entered.edgeId
    person.distance = entered.distanceAlongEdge
    person.direction = entered.direction
    return
  }
  const next = person.distance - step
  if (next >= 0) {
    person.distance = next
    return
  }
  const entered = leaveJunction(graph, person, edge.fromNodeId, -next)
  if (!entered) {
    person.direction = 1
    person.distance = 0
    return
  }
  person.edgeId = entered.edgeId
  person.distance = entered.distanceAlongEdge
  person.direction = entered.direction
}

/** Where they stand: at the roadside of the street they're on, and the way they face. */
export function crowdPlace(graph: RoadGraph, person: CrowdPerson): { lat: number; lng: number; heading: number } | null {
  const position: RoadPosition = {
    edgeId: person.edgeId,
    distanceAlongEdge: person.distance,
    direction: person.direction
  }
  const onRoad = getRoadCoordinate(graph, position)
  if (!onRoad) return null
  const heading = getRoadHeading(graph, position)
  const bearing = heading + person.side * (Math.PI / 2)
  const offset = roadsideOffset(graph.edges[person.edgeId]?.highway ?? "", person.lane)
  const east = Math.sin(bearing) * offset
  const north = Math.cos(bearing) * offset
  return {
    lat: onRoad.lat + north / 110540,
    lng: onRoad.lng + east / (111320 * Math.cos((onRoad.lat * Math.PI) / 180)),
    heading
  }
}
