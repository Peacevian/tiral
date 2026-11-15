import { describe, expect, it } from "vitest"
import roads from "./kampala-roads.json" with { type: "json" }
import { buildRoadGraph, type OverpassResponse } from "./index"
import { compactRoads, expandRoads } from "./compact"

const snapshot = roads as unknown as OverpassResponse

describe("compact roads", () => {
  it("builds exactly the same graph as the snapshot", () => {
    const compact = compactRoads(snapshot)
    // Through JSON, as it travels.
    const sent = JSON.parse(JSON.stringify(compact)) as typeof compact
    expect(buildRoadGraph(expandRoads(sent))).toEqual(buildRoadGraph(snapshot))
  })

  it("is a good deal smaller than the snapshot", () => {
    const compact = JSON.stringify(compactRoads(snapshot)).length
    const full = JSON.stringify({ elements: snapshot.elements }).length
    expect(compact).toBeLessThan(full / 3)
  })

  it("keeps the tags the game reads: names, foot=no, private access", () => {
    const data: OverpassResponse = {
      elements: [
        { type: "node", id: 1000000001, lat: 0.3125099, lon: 32.5776849 },
        { type: "node", id: 1000000002, lat: 0.3125199, lon: 32.5776949 },
        { type: "node", id: 5, lat: 0.31, lon: 32.57 },
        { type: "way", id: 77, nodes: [1000000001, 1000000002], tags: { highway: "primary", name: "Kampala Road" } },
        { type: "way", id: 78, nodes: [1000000002, 5], tags: { highway: "service", foot: "no" } },
        { type: "way", id: 79, nodes: [5, 1000000001], tags: { highway: "service", access: "private" } },
        { type: "way", id: 80, nodes: [5, 1000000002], tags: { highway: "path" } }
      ]
    }
    const back = expandRoads(JSON.parse(JSON.stringify(compactRoads(data))))
    const way = (id: number) => back.elements.find((e) => e.type === "way" && e.id === id) as { nodes: number[]; tags: Record<string, string> }
    expect(way(77).tags).toEqual({ highway: "primary", name: "Kampala Road" })
    expect(way(77).nodes).toEqual([1000000001, 1000000002])
    expect(way(78).tags.foot).toBe("no")
    expect(way(79).tags.access).toBe("no")
    expect(way(80).tags).toEqual({ highway: "path" })
    // Coordinates come back exactly (they are whole units of 1e-7 degrees).
    expect(back.elements[0]).toEqual({ type: "node", id: 1000000001, lat: 0.3125099, lon: 32.5776849 })
  })

  it("refuses a way that points at a missing point, and an unknown version", () => {
    expect(() => compactRoads({ elements: [{ type: "way", id: 1, nodes: [9, 10], tags: { highway: "path" } }] })).toThrow(/not in the data/)
    expect(() => expandRoads({ v: 2 } as never)).toThrow(/Unknown compact roads version/)
  })
})
