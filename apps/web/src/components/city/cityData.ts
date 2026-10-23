// Kampala's buildings and roads, in small square tiles the city loads near
// where the map is looking (public/data/city/v1, made by
// scripts/buildings/make_tiles.py). Everything is turned into local metres
// around one anchor in the middle of Kampala: x east, y south (the map's
// mercator frame), so all tiles share one group.

export const CITY_DATA = "/data/city/v1"

/** Kampala's middle: local metres are measured from here. */
export const ANCHOR = { lat: 0.3275, lng: 32.59 }
// Metres as the map counts them at the anchor (web mercator), so tiles 10 km
// out still sit exactly on their outlines: x from longitude, y from mercator
// latitude (not a flat metres-per-degree, which drifts ~0.7% here).
const METERS = 2 * Math.PI * 6378137 * Math.cos((ANCHOR.lat * Math.PI) / 180)
const mercY = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2
const ANCHOR_Y = mercY(ANCHOR.lat)

export function toLocal(lat: number, lng: number): [number, number] {
  return [((lng - ANCHOR.lng) / 360) * METERS, (mercY(lat) - ANCHOR_Y) * METERS]
}

export function toLatLng(x: number, y: number): { lat: number; lng: number } {
  const my = ANCHOR_Y + y / METERS
  return { lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI, lng: ANCHOR.lng + (x / METERS) * 360 }
}

export type CityIndex = { south: number; west: number; cell: number; tiles: Record<string, number> }

let index: Promise<CityIndex> | null = null

// Phones keep /data/ for a year (next.config.ts). In development the files
// change, so skip the cache there (a cached index from older data once left
// the middle of Kampala empty on localhost).
const FETCH: RequestInit = process.env.NODE_ENV === "development" ? { cache: "no-store" } : {}

export function loadIndex(): Promise<CityIndex> {
  index ??= fetch(`${CITY_DATA}/index.json`, FETCH).then((r) => {
    if (!r.ok) throw new Error(`city index ${r.status}`)
    return r.json() as Promise<CityIndex>
  })
  index.catch(() => {
    index = null
  })
  return index
}

/** A tile's south-west corner and its size (degrees). */
export function tileBounds(city: CityIndex, key: string) {
  const [y, x] = key.split("_").map(Number) as [number, number]
  const south = city.south + y * city.cell
  const west = city.west + x * city.cell
  return { south, west, north: south + city.cell, east: west + city.cell }
}

export type Footprint = {
  /** Closed ring, counter-clockwise on screen (walls face out). */
  ring: number[][]
  h: number
  colour: number
  shops: boolean
  seed: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export type Segment = { ax: number; ay: number; bx: number; by: number; width: number; along: number }

export type TileData = { key: string; center: { x: number; y: number }; buildings: Footprint[]; segments: Segment[]; bytes: number }

/** Road widths (m), by ROAD_CLASSES in make_tiles.py. */
const ROAD_WIDTHS = [13, 11, 9, 8, 6.5, 6, 4.5, 5]

type RawTile = { b: Array<[number, number, number, number[]]>; r: Array<[number, number[]]> }

export async function loadTile(city: CityIndex, key: string): Promise<TileData> {
  const response = await fetch(`${CITY_DATA}/${key}.json`, FETCH)
  if (!response.ok) throw new Error(`city tile ${key}: ${response.status}`)
  const text = await response.text()
  const raw = JSON.parse(text) as RawTile
  const { south, west, north, east } = tileBounds(city, key)
  const point = (flat: number[], i: number) => toLocal(south + flat[i + 1]! / 1e6, west + flat[i]! / 1e6)
  const [cx, cy] = toLocal((south + north) / 2, (west + east) / 2)
  const buildings: Footprint[] = []
  raw.b.forEach(([h10, colour, shops, flat], i) => {
    if (flat.length < 6) return
    let ring: number[][] = []
    for (let k = 0; k < flat.length; k += 2) ring.push(point(flat, k))
    ring.push(ring[0]!)
    // Counter-clockwise in screen space (y south) so walls face outwards.
    const area = ring.slice(0, -1).reduce((sum, [x, y], k) => sum + x! * ring[k + 1]![1]! - ring[k + 1]![0]! * y!, 0)
    if (area > 0) ring = [...ring].reverse()
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const [x, y] of ring) {
      minX = Math.min(minX, x!)
      maxX = Math.max(maxX, x!)
      minY = Math.min(minY, y!)
      maxY = Math.max(maxY, y!)
    }
    buildings.push({ ring, h: h10 / 10, colour, shops: shops === 1, seed: Math.abs(flat[0]! * 7 + flat[1]! * 13 + i), minX, maxX, minY, maxY })
  })
  const segments: Segment[] = []
  for (const [road, flat] of raw.r) {
    const width = ROAD_WIDTHS[road] ?? 6
    let along = 0
    for (let k = 0; k + 3 < flat.length; k += 2) {
      const [ax, ay] = point(flat, k)
      const [bx, by] = point(flat, k + 2)
      segments.push({ ax, ay, bx, by, width, along })
      along += Math.hypot(bx - ax, by - ay)
    }
  }
  return { key, center: { x: cx, y: cy }, buildings, segments, bytes: text.length }
}
