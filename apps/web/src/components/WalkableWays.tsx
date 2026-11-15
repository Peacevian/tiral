"use client"

import { useEffect, useMemo } from "react"
import type maplibregl from "maplibre-gl"
import { graphToGeoJSON, type RoadGraph } from "@tiral/road-graph"

// The runner follows the game's own walking network, which has more in it than
// the map draws as roads: service lanes, footpaths, paths and steps. This draws
// those ways as a faint dashed line so a runner on one never looks like it left
// the road. The main roads are left to the map.

const SOURCE = "tiral-walkable"
const LAYER = "tiral-walkable"
const SMALL = ["service", "living_street", "pedestrian", "footway", "path", "steps"]

export function WalkableWays({ map, graph, visible }: { map: maplibregl.Map | null; graph: RoadGraph | null; visible: boolean }) {
  const data = useMemo(() => {
    if (!graph) return null
    const all = graphToGeoJSON(graph)
    return { ...all, features: all.features.filter((feature) => SMALL.includes(String(feature.properties.highway))) }
  }, [graph])

  useEffect(() => {
    if (!map || !data || !visible) return
    const apply = () => {
      try {
        if (map.getLayer(LAYER)) return
        if (!map.getSource(SOURCE)) map.addSource(SOURCE, { type: "geojson", data: data as never })
        map.addLayer({
          id: LAYER,
          type: "line",
          source: SOURCE,
          minzoom: 15.5,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#c2410c",
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 15.5, 0, 17, 0.5],
            "line-width": ["interpolate", ["linear"], ["zoom"], 15.5, 0.8, 19, 2.4],
            "line-dasharray": [2, 1.5]
          }
        })
      } catch {
        // The style isn't parsed yet; the next style event tries again.
      }
    }
    apply()
    map.on("styledata", apply)
    return () => {
      map.off("styledata", apply)
      try {
        if (map.getLayer(LAYER)) map.removeLayer(LAYER)
        if (map.getSource(SOURCE)) map.removeSource(SOURCE)
      } catch {
        // The map itself is gone.
      }
    }
  }, [map, data, visible])

  return null
}
