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

const WALKABLE_HIGHWAYS = new Set([
  "primary",
  "secondary",
  "tertiary",
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

export function buildRoadGraph(data: OverpassResponse): RoadGraph {
  const osmNodes = new Map<number, LatLng>()
  const ways: OverpassWay[] = []

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
        access !== "no" &&
        foot !== "no"
      ) {
        ways.push(element)
      }
    }
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
