import type { LatLng } from "@tiral/game-core"
import { haversineDistanceMeters } from "@tiral/game-core"

export type RoadNode = {
  id: string
  position: LatLng
  edgeIds: string[]
}

export type RoadEdge = {
  id: string
  wayId: string
  fromNodeId: string
  toNodeId: string
  coordinates: [LatLng, LatLng]
  lengthMeters: number
  name: string | null
  highway: string
}

export type RoadGraph = {
  nodes: Record<string, RoadNode>
  edges: Record<string, RoadEdge>
}

export type RoadPosition = {
  edgeId: string
  distanceAlongEdge: number
  direction: 1 | -1
}

type OverpassNode = {
  type: "node"
  id: number
  lat: number
  lon: number
}

type OverpassWay = {
  type: "way"
  id: number
  nodes: number[]
  tags?: Record<string, string>
}

export type OverpassResponse = {
  elements: Array<OverpassNode | OverpassWay | { type: string; id: number }>
}

export type NearestEdgeResult = {
  edgeId: string
  distanceAlongEdge: number
  distanceMeters: number
}

export type RoadDirection = "left" | "straight" | "right"

export type ClassifiedRoad = {
  edgeId: string
  direction: RoadDirection
  angle: number
}

// A foot=no scrap this short, with both ends already on a walkable street, is a
// gap in the road (Jinja Road has one) rather than a road the runner should
// be kept off.
const GAP_BRIDGE_METERS = 40

const WALKABLE_HIGHWAYS = new Set([
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
  "residential",
  "unclassified",
  "living_street",
  "pedestrian",
  "service",
  "footway",
  "path",
  "steps"
])

type GeoJSONFeatureCollection = {
  type: "FeatureCollection"
  features: Array<{
    type: "Feature"
    properties: Record<string, unknown>
    geometry: {
      type: "LineString" | "Point"
      coordinates: number[] | number[][]
    }
  }>
}

function wayLengthMeters(way: OverpassWay, osmNodes: Map<number, LatLng>) {
  let length = 0
  for (let index = 1; index < way.nodes.length; index++) {
    const from = osmNodes.get(way.nodes[index - 1]!)
    const to = osmNodes.get(way.nodes[index]!)
    if (!from || !to) return null
    length += haversineDistanceMeters(from, to)
  }
  return length
}

export function buildRoadGraph(data: OverpassResponse): RoadGraph {
  const osmNodes = new Map<number, LatLng>()
  const ways: OverpassWay[] = []
  const footNoWays: OverpassWay[] = []

  for (const element of data.elements) {
    if (element.type === "node" && "lat" in element) {
      osmNodes.set(element.id, { lat: element.lat, lng: element.lon })
    } else if (element.type === "way" && "nodes" in element) {
      const highway = element.tags?.highway
      const access = element.tags?.access
      const foot = element.tags?.foot
      if (
        highway &&
        WALKABLE_HIGHWAYS.has(highway) &&
        access !== "private" &&
        access !== "no"
      ) {
        if (foot === "no") footNoWays.push(element)
        else ways.push(element)
      }
    }
  }

  const openNodes = new Set(ways.flatMap((way) => way.nodes))
  for (const way of footNoWays) {
    const start = way.nodes[0]
    const end = way.nodes[way.nodes.length - 1]
    if (start === undefined || end === undefined) continue
    if (!openNodes.has(start) || !openNodes.has(end)) continue
    const length = wayLengthMeters(way, osmNodes)
    if (length !== null && length <= GAP_BRIDGE_METERS) ways.push(way)
  }

  const graph: RoadGraph = { nodes: {}, edges: {} }

  for (const way of ways) {
    for (let index = 1; index < way.nodes.length; index++) {
      const fromOsmId = way.nodes[index - 1]!
      const toOsmId = way.nodes[index]!
      const from = osmNodes.get(fromOsmId)
      const to = osmNodes.get(toOsmId)
      if (!from || !to) continue

      const fromNodeId = String(fromOsmId)
      const toNodeId = String(toOsmId)
      const edgeId = `${way.id}:${index - 1}`
      const edge: RoadEdge = {
        id: edgeId,
        wayId: String(way.id),
        fromNodeId,
        toNodeId,
        coordinates: [from, to],
        lengthMeters: haversineDistanceMeters(from, to),
        name: way.tags?.name ?? null,
        highway: way.tags?.highway ?? "road"
      }

      graph.edges[edgeId] = edge
      graph.nodes[fromNodeId] ??= { id: fromNodeId, position: from, edgeIds: [] }
      graph.nodes[toNodeId] ??= { id: toNodeId, position: to, edgeIds: [] }
      graph.nodes[fromNodeId]!.edgeIds.push(edgeId)
      graph.nodes[toNodeId]!.edgeIds.push(edgeId)
    }
  }

  return graph
}

function toLocalMeters(point: LatLng, origin: LatLng) {
  const latitudeRadians = (origin.lat * Math.PI) / 180
  return {
    x: (point.lng - origin.lng) * 111320 * Math.cos(latitudeRadians),
    y: (point.lat - origin.lat) * 110540
  }
}

export function findNearestEdge(graph: RoadGraph, point: LatLng): NearestEdgeResult | null {
  let nearest: NearestEdgeResult | null = null

  for (const edge of Object.values(graph.edges)) {
    const start = toLocalMeters(edge.coordinates[0], point)
    const end = toLocalMeters(edge.coordinates[1], point)
    const segmentX = end.x - start.x
    const segmentY = end.y - start.y
    const lengthSquared = segmentX * segmentX + segmentY * segmentY
    const t = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, (-(start.x * segmentX + start.y * segmentY)) / lengthSquared))
    const projectedX = start.x + segmentX * t
    const projectedY = start.y + segmentY * t
    const distanceMeters = Math.hypot(projectedX, projectedY)

    if (!nearest || distanceMeters < nearest.distanceMeters) {
      nearest = {
        edgeId: edge.id,
        distanceAlongEdge: edge.lengthMeters * t,
        distanceMeters
      }
    }
  }

  return nearest
}

export function getRoadCoordinate(graph: RoadGraph, position: RoadPosition) {
  const edge = graph.edges[position.edgeId]
  if (!edge) return null
  const t = Math.max(0, Math.min(1, position.distanceAlongEdge / edge.lengthMeters))
  const from = edge.coordinates[0]
  const to = edge.coordinates[1]
  return {
    lat: from.lat + (to.lat - from.lat) * t,
    lng: from.lng + (to.lng - from.lng) * t
  }
}

export function getRoadHeading(graph: RoadGraph, position: RoadPosition) {
  const edge = graph.edges[position.edgeId]
  if (!edge) return 0
  const from = position.direction === 1 ? edge.coordinates[0] : edge.coordinates[1]
  const to = position.direction === 1 ? edge.coordinates[1] : edge.coordinates[0]
  const latitudeRadians = (((from.lat + to.lat) / 2) * Math.PI) / 180
  const dx = (to.lng - from.lng) * Math.cos(latitudeRadians)
  const dy = to.lat - from.lat
  return Math.atan2(dx, dy)
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}

export function getEdgeHeadingFromNode(graph: RoadGraph, edgeId: string, nodeId: string) {
  const edge = graph.edges[edgeId]
  if (!edge) return null
  const from = edge.fromNodeId === nodeId ? edge.coordinates[0] : edge.coordinates[1]
  const to = edge.fromNodeId === nodeId ? edge.coordinates[1] : edge.coordinates[0]
  const latitudeRadians = (((from.lat + to.lat) / 2) * Math.PI) / 180
  const dx = (to.lng - from.lng) * Math.cos(latitudeRadians)
  const dy = to.lat - from.lat
  return Math.atan2(dx, dy)
}

export function getUpcomingNode(graph: RoadGraph, position: RoadPosition) {
  const edge = graph.edges[position.edgeId]
  if (!edge) return null
  return position.direction === 1 ? graph.nodes[edge.toNodeId] : graph.nodes[edge.fromNodeId]
}

export function getDistanceToUpcomingNode(graph: RoadGraph, position: RoadPosition) {
  const edge = graph.edges[position.edgeId]
  if (!edge) return Infinity
  return position.direction === 1
    ? edge.lengthMeters - position.distanceAlongEdge
    : position.distanceAlongEdge
}

export function classifyConnectedEdges(graph: RoadGraph, position: RoadPosition): ClassifiedRoad[] {
  const currentEdge = graph.edges[position.edgeId]
  const node = getUpcomingNode(graph, position)
  if (!currentEdge || !node) return []

  const incomingHeading = getRoadHeading(graph, position)
  return node.edgeIds
    .filter((edgeId) => edgeId !== currentEdge.id)
    .map((edgeId) => {
      const outgoingHeading = getEdgeHeadingFromNode(graph, edgeId, node.id) ?? incomingHeading
      const angle = normalizeAngle(outgoingHeading - incomingHeading)
      const degrees = (angle * 180) / Math.PI
      const direction: RoadDirection = degrees < -35
        ? "left"
        : degrees > 35
          ? "right"
          : "straight"
      return { edgeId, direction, angle }
    })
}

export function isEdgeReachable(graph: RoadGraph, fromEdgeId: string, toEdgeId: string): boolean {
  if (fromEdgeId === toEdgeId) return true
  const from = graph.edges[fromEdgeId]
  if (!from || !graph.edges[toEdgeId]) return false
  const visited = new Set<string>([from.fromNodeId, from.toNodeId])
  const queue = [from.fromNodeId, from.toNodeId]
  while (queue.length > 0) {
    const nodeId = queue.pop()!
    const node = graph.nodes[nodeId]
    if (!node) continue
    for (const edgeId of node.edgeIds) {
      if (edgeId === toEdgeId) return true
      const edge = graph.edges[edgeId]
      if (!edge) continue
      for (const next of [edge.fromNodeId, edge.toNodeId]) {
        if (!visited.has(next)) {
          visited.add(next)
          queue.push(next)
        }
      }
    }
  }
  return false
}

export function chooseBestEdge(candidates: ClassifiedRoad[], intent: RoadDirection | null) {
  if (!candidates.length) return null
  const matching = intent
    ? candidates.filter((candidate) => candidate.direction === intent)
    : candidates
  if (!matching.length) return null
  const target = intent === "left" ? -Math.PI / 2 : intent === "right" ? Math.PI / 2 : 0
  return matching.reduce((best, candidate) => {
    if (!best) return candidate
    return Math.abs(candidate.angle - target) < Math.abs(best.angle - target) ? candidate : best
  }, null as ClassifiedRoad | null)
}

/** The junction a runner just went through (straight by default), for a late turn. */
export type PassedJunction = {
  nodeId: string
  candidates: ClassifiedRoad[]
  chosenEdgeId: string
  /** The turn the runner had asked for there (null = went straight by default). */
  intent: RoadDirection | null
}

/** A turn tapped up to this far past a junction still counts at that junction. */
export const LATE_TURN_METERS = 10

/** Enter `edgeId` from `nodeId`, `overflow` metres along it. */
export function enterEdgeFrom(graph: RoadGraph, edgeId: string, nodeId: string, overflow: number): RoadPosition | null {
  const edge = graph.edges[edgeId]
  if (!edge) return null
  const direction: 1 | -1 = edge.fromNodeId === nodeId ? 1 : -1
  return {
    edgeId,
    distanceAlongEdge: direction === 1 ? Math.min(overflow, edge.lengthMeters) : Math.max(edge.lengthMeters - overflow, 0),
    direction
  }
}

/**
 * A turn asked for just after a junction the runner went straight through (on
 * a slow network the phone runs a little ahead of the server, so taps land
 * "late"): move the runner onto that turn, as far along it as it has gone
 * since the junction. Returns null when it doesn't apply (too far past, the
 * runner had asked for a turn there, or that turn doesn't exist there).
 */
export function lateTurn(
  graph: RoadGraph,
  position: RoadPosition,
  passed: PassedJunction | null,
  direction: RoadDirection
): RoadPosition | null {
  if (!passed || passed.intent || position.edgeId !== passed.chosenEdgeId) return null
  const edge = graph.edges[position.edgeId]
  if (!edge) return null
  // Only while still heading away from that junction on the road we took.
  const leftFromStart = edge.fromNodeId === passed.nodeId && position.direction === 1
  const leftFromEnd = edge.toNodeId === passed.nodeId && position.direction === -1
  if (!leftFromStart && !leftFromEnd) return null
  const travelled = leftFromStart ? position.distanceAlongEdge : edge.lengthMeters - position.distanceAlongEdge
  if (travelled > LATE_TURN_METERS) return null
  const turn = chooseBestEdge(passed.candidates, direction)
  if (!turn || turn.edgeId === passed.chosenEdgeId) return null
  return enterEdgeFrom(graph, turn.edgeId, passed.nodeId, travelled)
}

export function graphToGeoJSON(graph: RoadGraph): GeoJSONFeatureCollection {
  return {
    type: "FeatureCollection",
    features: Object.values(graph.edges).map((edge) => ({
      type: "Feature",
      properties: {
        id: edge.id,
        name: edge.name,
        highway: edge.highway
      },
      geometry: {
        type: "LineString",
        coordinates: edge.coordinates.map((coordinate) => [coordinate.lng, coordinate.lat])
      }
    }))
  }
}

export {
  CROWD_POOL,
  CROWD_DROP_METERS,
  GROUP_SIZE,
  busyStreet,
  crowdCount,
  crowdPlace,
  edgesNear,
  groupSlot,
  kampalaHour,
  separateCrowd,
  spawnCrowdGroup,
  spawnCrowdPerson,
  stepCrowdPerson,
  type CrowdPerson,
  type Stillness
} from "./crowd"

export { compactRoads, expandRoads, type CompactRoads } from "./compact"

export function junctionsToGeoJSON(graph: RoadGraph): GeoJSONFeatureCollection {
  return {
    type: "FeatureCollection",
    features: Object.values(graph.nodes)
      .filter((node) => node.edgeIds.length > 2)
      .map((node) => ({
        type: "Feature",
        properties: { id: node.id, connections: node.edgeIds.length },
        geometry: {
          type: "Point",
          coordinates: [node.position.lng, node.position.lat]
        }
      }))
  }
}
