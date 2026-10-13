import { buildRoadGraph, type OverpassResponse, type RoadGraph } from "@tiral/road-graph"
import roads from "@tiral/road-graph/kampala-roads.json" with { type: "json" }

// Built once from the baked snapshot (same data the web client uses), so rooms
// never wait on — or fail because of — the live OSM API.
let cachedGraph: RoadGraph | null = null

export function loadRoadGraph(): Promise<RoadGraph> {
  cachedGraph ??= buildRoadGraph(roads as OverpassResponse)
  return Promise.resolve(cachedGraph)
}

export function getCachedRoadGraph(): RoadGraph | null {
  return cachedGraph
}
