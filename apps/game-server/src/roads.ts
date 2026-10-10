import { buildRoadGraph, type OverpassResponse, type RoadGraph } from "@tiral/road-graph"

const BOUNDS = {
  south: 0.309,
  west: 32.574,
  north: 0.321,
  east: 32.588
}

let cachedGraph: RoadGraph | null = null
let inflight: Promise<RoadGraph> | null = null

export function loadRoadGraph(): Promise<RoadGraph> {
  if (cachedGraph) return Promise.resolve(cachedGraph)
  if (inflight) return inflight

  inflight = (async () => {
    const bbox = `${BOUNDS.west},${BOUNDS.south},${BOUNDS.east},${BOUNDS.north}`
    const response = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bbox}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Tiral-Kampala-road-prototype/0.1"
      }
    })
    if (!response.ok) {
      throw new Error(`OpenStreetMap returned ${response.status}`)
    }
    const data = await response.json() as OverpassResponse
    cachedGraph = buildRoadGraph(data)
    return cachedGraph
  })()

  inflight.catch(() => {
    inflight = null
  })

  return inflight
}

export function getCachedRoadGraph(): RoadGraph | null {
  return cachedGraph
}
