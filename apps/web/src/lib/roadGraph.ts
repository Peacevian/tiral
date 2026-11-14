import { buildRoadGraph, type OverpassResponse, type RoadGraph } from "@tiral/road-graph"

/**
 * The play-zone road network, downloaded and built once per page load and
 * shared by /play and /hustle (switching between them used to refetch the
 * ~70 KB snapshot and rebuild the graph on the main thread each time).
 */
let graph: Promise<RoadGraph> | null = null

export function loadRoadGraph(): Promise<RoadGraph> {
  // `v` changes when the baked roads change. The response is cached for a day,
  // so without it a phone keeps the old network and still stops on a fixed gap.
  graph ??= fetch("/api/roads?v=2")
    .then(async (response) => {
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `Road request failed with ${response.status}`)
      }
      return response.json() as Promise<OverpassResponse>
    })
    .then(buildRoadGraph)
    .catch((error: unknown) => {
      // Let the next visit try again.
      graph = null
      throw error
    })
  return graph
}
