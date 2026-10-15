import type { StyleSpecification } from "maplibre-gl"

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
  const sources = { ...style.sources }
  // A raster relief source no layer draws.
  for (const [id, source] of Object.entries(sources)) {
    if (source.type === "raster" && !layers.some((layer) => "source" in layer && layer.source === id)) delete sources[id]
  }
  const { sprite: _sprite, ...rest } = style
  return { ...rest, sources, layers }
}
