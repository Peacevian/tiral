import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl"
import { isLiteDevice } from "@/lib/deviceTier"

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron"

/**
 * The game map style, trimmed for phones on slow networks. Positron as served
 * costs ~250 KB before a single tile: a high-res icon sheet (117 KB) used only
 * by US highway shields, an airport icon and city dots, and three fonts
 * (regular/italic/bold, ~45 KB each). The game needs none of that, so: no
 * sprite, no icon layers, one font. Fetched once per page load and shared.
 */
let slimStyle: Promise<StyleSpecification> | null = null

export function loadMapStyle(): Promise<StyleSpecification | string> {
  slimStyle ??= fetch(MAP_STYLE_URL)
    .then((response) => {
      if (!response.ok) throw new Error(String(response.status))
      return response.json() as Promise<StyleSpecification>
    })
    .then(slimMapStyle)
  // On any failure, fall back to the full style URL (and try again next time).
  return slimStyle.catch(() => {
    slimStyle = null
    return MAP_STYLE_URL
  })
}

const FONT = ["Noto Sans Regular"]

/**
 * Where Tiral has its own buildings (public/data/kampala-buildings-v1.json:
 * OpenStreetMap outlines with Google Open Buildings 2.5D heights, made by
 * scripts/buildings): central Kampala and Lugogo. The map's plain blocks are
 * hidden there so the two never overlap.
 */
const OWN_BUILDINGS_URL = "/data/kampala-buildings-v1.json"
const OWN_AREAS = {
  type: "MultiPolygon",
  coordinates: [
    [[[32.574, 0.309], [32.588, 0.309], [32.588, 0.321], [32.574, 0.321], [32.574, 0.309]]],
    [[[32.6058, 0.3236], [32.6094, 0.3236], [32.6094, 0.3268], [32.6058, 0.3268], [32.6058, 0.3236]]]
  ]
}

/** Tiral's own buildings: real heights, and colours by kind (towers glass and concrete, shops painted). */
export function ownBuildings3d(lite: boolean): LayerSpecification {
  const from = lite ? 15.5 : 14.8
  const scale = lite ? 0.85 : 1
  return {
    id: "tiral-buildings-3d",
    type: "fill-extrusion",
    source: "tiral-buildings",
    minzoom: from,
    paint: {
      "fill-extrusion-color": ["get", "c"],
      "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], from, 0, from + 0.6, ["*", scale, ["get", "h"]]],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.95,
      "fill-extrusion-vertical-gradient": true
    }
  } as LayerSpecification
}

/**
 * The map's own blocks' height: flat (hidden) inside `hidden` (polygons, as
 * MultiPolygon coordinates), where Tiral draws its own buildings.
 */
export function buildingsHeight(lite: boolean, hidden: number[][][][]): ExpressionSpecification {
  const from = lite ? 15.5 : 14.8
  const scale = lite ? 0.75 : 1
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    from,
    0,
    from + 0.6,
    ["case", [">", ["distance", { type: "MultiPolygon", coordinates: hidden }], 0], ["*", scale, ["max", 6, ["coalesce", ["get", "render_height"], 6]]], 0]
  ] as unknown as ExpressionSpecification
}

/** Where Tiral's own buildings are (central Kampala, Lugogo): the map hides its blocks there. */
export const OWN_BUILDING_AREAS = OWN_AREAS.coordinates

/**
 * 3D buildings from the map's own building outlines (OpenStreetMap via
 * OpenFreeMap): pushed up to their mapped height, or 2 floors when Kampala's
 * data doesn't say. They rise in as you zoom into the streets, so the city
 * view stays clean; cheap phones get lower, later buildings.
 */
export function buildings3d(lite: boolean): LayerSpecification {
  const from = lite ? 15.5 : 14.8
  return {
    id: "building-3d",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    minzoom: from,
    filter: ["!=", ["get", "hide_3d"], true],
    paint: {
      // Cream plaster; tall ones concrete grey. (The map's buildings carry no
      // id or colour to vary them by.)
      "fill-extrusion-color": ["case", [">", ["coalesce", ["get", "render_height"], 0], 20], "#C9CDD2", "#ECE3D0"],
      // Flat (hidden) where Tiral draws its own buildings with real heights.
      "fill-extrusion-height": buildingsHeight(lite, OWN_AREAS.coordinates),
      "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
      "fill-extrusion-opacity": 0.92,
      "fill-extrusion-vertical-gradient": true
    }
  } as LayerSpecification
}

export function slimMapStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers
    // Shield and airport layers are icons first; Kampala has no US shields.
    .filter((layer) => !/shield|airport/.test(layer.id))
    .map((layer) => {
      if (layer.type !== "symbol" || !layer.layout) return layer
      const layout: Record<string, unknown> = { ...layer.layout }
      // City/town dots: keep the name, drop the icon (and the sprite with it).
      for (const key of Object.keys(layout)) if (key.startsWith("icon-")) delete layout[key]
      if (layout["text-font"]) layout["text-font"] = FONT
      return { ...layer, layout } as typeof layer
    })
  // Buildings in 3D above every road, bridge and rail line (so a building in
  // front hides the street behind it) but under the labels.
  if (layers.some((layer) => layer.id === "building")) {
    const labels = layers.findIndex((layer) => layer.type === "symbol")
    const lite = typeof window !== "undefined" && isLiteDevice()
    layers.splice(labels >= 0 ? labels : layers.length, 0, buildings3d(lite), ownBuildings3d(lite))
  }
  const sources: StyleSpecification["sources"] = { ...style.sources, "tiral-buildings": { type: "geojson", data: OWN_BUILDINGS_URL, attribution: "Building heights © Google Open Buildings (CC BY 4.0), Copernicus Sentinel-2" } }
  // A raster relief source no layer draws.
  for (const [id, source] of Object.entries(sources)) {
    if (source.type === "raster" && !layers.some((layer) => "source" in layer && layer.source === id)) delete sources[id]
  }
  const { sprite: _sprite, ...rest } = style
  // Afternoon sun from the west, so walls get light and shade.
  return { ...rest, sources, layers, light: { anchor: "map", position: [1.4, 250, 50], intensity: 0.45, color: "#FFF4DE" } }
}
