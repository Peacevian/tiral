import type { OverpassResponse } from "./index"

// The play-zone roads in a form a third the size to download and parse. The
// snapshot (kampala-roads.json) is the OpenStreetMap format: every point has a
// 10-digit id and 7-decimal coordinates, and every way lists those ids again.
// Here the points are in the order the roads first use them, with ids and
// coordinates stored as small differences, and ways point at them by position.
// Nothing is rounded: `expandRoads` gives back the same points and roads, so
// the client builds the same graph as the server (which keeps reading the
// snapshot directly). Phones download this (`/api/roads/compact`).

/** Coordinates are stored as whole units of 1e-7 degrees (the snapshot's precision). */
const SCALE = 1e7

export type CompactRoads = {
  /** Format version. */
  v: 1
  /** Road classes ("residential", "primary", …); a way's second number indexes this. */
  highways: string[]
  /** Street names; a way's third number indexes this (-1: unnamed). */
  names: string[]
  /** OpenStreetMap point ids, as differences from the one before. */
  ids: number[]
  /** Latitudes in 1e-7 degrees, as differences from the one before. */
  lats: number[]
  /** Longitudes, likewise. */
  lons: number[]
  /**
   * One array per way: [way id, highway index, name index, flags, ...points],
   * the points as differences between positions in the table above. Flags: 1 is
   * foot=no, 2 is access=private or no (the only tags the game reads).
   */
  ways: number[][]
}

function differences(values: number[]): number[] {
  return values.map((value, i) => (i === 0 ? value : value - values[i - 1]!))
}

function sums(deltas: number[]): number[] {
  const out: number[] = []
  let total = 0
  for (const delta of deltas) out.push((total += delta))
  return out
}

/** The snapshot's roads, compacted. Points no road uses are dropped. */
export function compactRoads(data: OverpassResponse): CompactRoads {
  const points = new Map<number, { lat: number; lon: number }>()
  for (const element of data.elements) {
    if (element.type === "node" && "lat" in element) points.set(element.id, { lat: element.lat, lon: element.lon })
  }
  const position = new Map<number, number>()
  const order: number[] = []
  const highways: string[] = []
  const names: string[] = []
  const ways: number[][] = []
  for (const element of data.elements) {
    if (element.type !== "way" || !("nodes" in element)) continue
    const tags = element.tags ?? {}
    const highway = tags.highway ?? ""
    let h = highways.indexOf(highway)
    if (h < 0) h = highways.push(highway) - 1
    let n = -1
    if (tags.name) {
      n = names.indexOf(tags.name)
      if (n < 0) n = names.push(tags.name) - 1
    }
    const flags = (tags.foot === "no" ? 1 : 0) | (tags.access === "private" || tags.access === "no" ? 2 : 0)
    const indexes = element.nodes.map((id) => {
      let at = position.get(id)
      if (at === undefined) {
        if (!points.has(id)) throw new Error(`way ${element.id} uses point ${id}, which is not in the data`)
        at = order.push(id) - 1
        position.set(id, at)
      }
      return at
    })
    ways.push([element.id, h, n, flags, ...differences(indexes)])
  }
  return {
    v: 1,
    highways,
    names,
    ids: differences(order),
    lats: differences(order.map((id) => Math.round(points.get(id)!.lat * SCALE))),
    lons: differences(order.map((id) => Math.round(points.get(id)!.lon * SCALE))),
    ways
  }
}

/** The OpenStreetMap-format roads (what `buildRoadGraph` reads) from a compact copy. */
export function expandRoads(compact: CompactRoads): OverpassResponse {
  if (compact.v !== 1) throw new Error(`Unknown compact roads version ${String(compact.v)}`)
  const ids = sums(compact.ids)
  const lats = sums(compact.lats)
  const lons = sums(compact.lons)
  const elements: OverpassResponse["elements"] = ids.map((id, i) => ({ type: "node", id, lat: lats[i]! / SCALE, lon: lons[i]! / SCALE }))
  for (const [id, h, n, flags, ...deltas] of compact.ways) {
    const tags: Record<string, string> = { highway: compact.highways[h!]! }
    if (n! >= 0) tags.name = compact.names[n!]!
    if (flags! & 1) tags.foot = "no"
    if (flags! & 2) tags.access = "no"
    elements.push({ type: "way", id: id!, nodes: sums(deltas).map((at) => ids[at]!), tags })
  }
  return { elements }
}
