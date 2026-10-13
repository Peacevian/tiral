// Bakes the walkable Kampala road network into a trimmed JSON snapshot so
// neither the web app nor the game server hits the live OSM API at runtime.
// Re-run when the play zone changes: `pnpm --filter @tiral/road-graph snapshot`
import { writeFile } from "node:fs/promises"

const BOUNDS = { south: 0.309, west: 32.574, north: 0.321, east: 32.588 }

const WALKABLE_HIGHWAYS = new Set([
  "primary", "secondary", "tertiary", "residential", "unclassified", "living_street",
  "pedestrian", "service", "footway", "path", "steps"
])

const KEPT_TAGS = ["highway", "name", "access", "foot"]

const bbox = `${BOUNDS.west},${BOUNDS.south},${BOUNDS.east},${BOUNDS.north}`
const response = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`, {
  headers: { Accept: "application/json", "User-Agent": "Tiral-Kampala-road-prototype/0.1" }
})
if (!response.ok) throw new Error(`OpenStreetMap returned ${response.status}`)
const data = await response.json()

const ways = data.elements
  .filter((element) => {
    if (element.type !== "way") return false
    const tags = element.tags ?? {}
    return WALKABLE_HIGHWAYS.has(tags.highway) && tags.access !== "private" && tags.access !== "no" && tags.foot !== "no"
  })
  .map((way) => ({
    type: "way",
    id: way.id,
    nodes: way.nodes,
    tags: Object.fromEntries(KEPT_TAGS.filter((key) => way.tags[key] !== undefined).map((key) => [key, way.tags[key]]))
  }))
const nodeIds = new Set(ways.flatMap((way) => way.nodes))
const nodes = data.elements
  .filter((element) => element.type === "node" && nodeIds.has(element.id))
  .map((node) => ({ type: "node", id: node.id, lat: node.lat, lon: node.lon }))

const out = new URL("../src/kampala-roads.json", import.meta.url)
await writeFile(out, JSON.stringify({ bounds: BOUNDS, generatedAt: new Date().toISOString(), elements: [...nodes, ...ways] }))
console.log(`Wrote ${nodes.length} nodes, ${ways.length} ways → ${out.pathname}`)
