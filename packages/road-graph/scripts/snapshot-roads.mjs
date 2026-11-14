// Bakes the walkable Kampala road network into a trimmed JSON snapshot so
// neither the web app nor the game server hits the live OSM API at runtime.
// Re-run when the play zone changes: `pnpm --filter @tiral/road-graph snapshot`
import { writeFile } from "node:fs/promises"

// Same rectangle as KAMPALA_ZONE in packages/game-core/src/zone.ts. The map
// draws every street in this box. A smaller snapshot let a road run past the
// old edge and then stop, because the next piece of that street was never
// downloaded.
const ZONE = { south: 0.305, west: 32.565, north: 0.325, east: 32.595 }

// The map call returns, in full, any way that touches a node inside the box.
// This margin keeps the next piece of a street that crosses the zone border,
// so the runner does not hit a wall on the line.
const MARGIN = 0.002
const BOUNDS = {
  south: ZONE.south - MARGIN,
  west: ZONE.west - MARGIN,
  north: ZONE.north + MARGIN,
  east: ZONE.east + MARGIN
}

// Trunk and link roads are included because Kampala's main streets (Jinja Road,
// Yusuf Lule Road) switch to those tags mid-way. The map still draws them, and
// leaving them out stops the runner on the road. foot=no and private access
// are still dropped below. Motorways are not walkable.
const WALKABLE_HIGHWAYS = new Set([
  "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
  "tertiary", "tertiary_link", "residential", "unclassified", "living_street",
  "pedestrian", "service", "footway", "path", "steps"
])

const KEPT_TAGS = ["highway", "name", "access", "foot"]

const HEADERS = { Accept: "application/json", "User-Agent": "Tiral-Kampala-road-prototype/0.1" }

// The map call refuses a box with more than 50,000 nodes, which central
// Kampala exceeds. Split until each tile is small enough, then merge.
async function fetchMap(bounds) {
  const span = Math.max(bounds.north - bounds.south, bounds.east - bounds.west)
  const bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`
  const response = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`, { headers: HEADERS })
  if (response.ok) return response.json()
  const body = await response.text()
  if (response.status === 400 && body.includes("too many nodes") && span > 0.002) {
    const midLat = (bounds.south + bounds.north) / 2
    const midLng = (bounds.west + bounds.east) / 2
    const tiles = [
      { south: bounds.south, west: bounds.west, north: midLat, east: midLng },
      { south: bounds.south, west: midLng, north: midLat, east: bounds.east },
      { south: midLat, west: bounds.west, north: bounds.north, east: midLng },
      { south: midLat, west: midLng, north: bounds.north, east: bounds.east }
    ]
    const parts = []
    for (const tile of tiles) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      parts.push(await fetchMap(tile))
    }
    return { elements: parts.flatMap((part) => part.elements) }
  }
  throw new Error(`OpenStreetMap returned ${response.status}: ${body.slice(0, 200)}`)
}

const data = await fetchMap(BOUNDS)
const elements = [...new Map(data.elements.map((element) => [`${element.type}:${element.id}`, element])).values()]

const nodeById = new Map(elements.filter((element) => element.type === "node").map((node) => [node.id, node]))
const distanceMeters = (from, to) => {
  const radius = 6371000
  const toRadians = Math.PI / 180
  const lat = ((to.lat - from.lat) * toRadians) / 2
  const lng = ((to.lon - from.lon) * toRadians) / 2
  const h = Math.sin(lat) ** 2 + Math.cos(from.lat * toRadians) * Math.cos(to.lat * toRadians) * Math.sin(lng) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}
const GAP_BRIDGE_METERS = 40

const usable = elements.filter((element) => {
  if (element.type !== "way") return false
  const tags = element.tags ?? {}
  return WALKABLE_HIGHWAYS.has(tags.highway) && tags.access !== "private" && tags.access !== "no"
})
const open = usable.filter((way) => way.tags?.foot !== "no")
const openNodes = new Set(open.flatMap((way) => way.nodes))
const bridges = usable.filter((way) => {
  if (way.tags?.foot !== "no") return false
  const start = way.nodes[0]
  const end = way.nodes[way.nodes.length - 1]
  if (!openNodes.has(start) || !openNodes.has(end)) return false
  let length = 0
  for (let index = 1; index < way.nodes.length; index++) {
    const from = nodeById.get(way.nodes[index - 1])
    const to = nodeById.get(way.nodes[index])
    if (!from || !to) return false
    length += distanceMeters(from, to)
  }
  return length <= GAP_BRIDGE_METERS
})

const ways = [...open, ...bridges]
  .map((way) => ({
    type: "way",
    id: way.id,
    nodes: way.nodes,
    tags: Object.fromEntries(KEPT_TAGS.filter((key) => way.tags[key] !== undefined).map((key) => [key, way.tags[key]]))
  }))
const nodeIds = new Set(ways.flatMap((way) => way.nodes))
const nodes = elements
  .filter((element) => element.type === "node" && nodeIds.has(element.id))
  .map((node) => ({ type: "node", id: node.id, lat: node.lat, lon: node.lon }))

const out = new URL("../src/kampala-roads.json", import.meta.url)
const round = (value) => Math.round(value * 1e6) / 1e6
const bounds = {
  south: round(BOUNDS.south),
  west: round(BOUNDS.west),
  north: round(BOUNDS.north),
  east: round(BOUNDS.east)
}
await writeFile(out, JSON.stringify({ bounds, generatedAt: new Date().toISOString(), elements: [...nodes, ...ways] }))
console.log(`Wrote ${nodes.length} nodes, ${ways.length} ways (${bridges.length} gap bridges) → ${out.pathname}`)
