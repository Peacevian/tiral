import { buildRoadGraph, type OverpassResponse, type RoadGraph } from "@tiral/road-graph"

/**
 * The play-zone road network, downloaded and built once per page load and
 * shared by /play and /hustle (switching between them used to refetch the
 * ~70 KB snapshot and rebuild the graph on the main thread each time).
 */
let graph: Promise<RoadGraph> | null = null

export function loadRoadGraph(): Promise<RoadGraph> {
  graph ??= fetch("/api/roads")
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
