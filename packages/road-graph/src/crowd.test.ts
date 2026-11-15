import { describe, expect, it } from "vitest"
import { haversineDistanceMeters, type LatLng } from "@tiral/game-core"
import { getRoadCoordinate, type RoadGraph } from "./index"
import {
  CROWD_POOL,
  busyStreet,
  crowdCount,
  crowdPlace,
  edgesNear,
  groupSlot,
  kampalaHour,
  roadsideOffset,
  spawnCrowdGroup,
  separateCrowd,
  spawnCrowdPerson,
  stepCrowdPerson
} from "./crowd"

function edge(id: string, from: LatLng, to: LatLng, fromId: string, toId: string) {
  return {
    id,
    wayId: id,
    fromNodeId: fromId,
    toNodeId: toId,
    coordinates: [from, to] as [LatLng, LatLng],
    lengthMeters: haversineDistanceMeters(from, to),
    name: null,
    highway: "residential"
  }
}

// A corner: east along e1, then north along e2. e3 is a dead end to the south.
function corner(): RoadGraph {
  const a = { lat: 0.31, lng: 32.58 }
  const b = { lat: 0.31, lng: 32.581 }
  const c = { lat: 0.311, lng: 32.581 }
  const d = { lat: 0.309, lng: 32.581 }
  const e1 = edge("e1", a, b, "a", "b")
  const e2 = edge("e2", b, c, "b", "c")
  const e3 = edge("e3", b, d, "b", "d")
  return {
    nodes: {
      a: { id: "a", position: a, edgeIds: ["e1"] },
      b: { id: "b", position: b, edgeIds: ["e1", "e2", "e3"] },
      c: { id: "c", position: c, edgeIds: ["e2"] },
      d: { id: "d", position: d, edgeIds: ["e3"] }
    },
    edges: { e1, e2, e3 }
  }
}

describe("street crowd", () => {
  it("uses Kampala time", () => {
    expect(kampalaHour(new Date("2026-11-09T10:00:00Z"))).toBe(13)
    expect(kampalaHour(new Date("2026-11-09T21:30:00Z"))).toBe(0)
  })

  it("hides the crowd on the city view and caps cheap phones", () => {
    expect(crowdCount(15.9, false, 20, true)).toBe(0)
    expect(crowdCount(17, true, 20, true)).toBeLessThanOrEqual(16)
    expect(crowdCount(17, false, 20, true)).toBeGreaterThan(crowdCount(17, false, 8, false))
    expect(crowdCount(17, false, 20, true)).toBeLessThanOrEqual(CROWD_POOL)
  })

  it("fills the streets: dozens by day, the whole pool at the busiest places in the evening", () => {
    expect(crowdCount(17.5, false, 11, false)).toBeGreaterThanOrEqual(24)
    expect(crowdCount(17.5, false, 20, false)).toBe(40)
    expect(crowdCount(17.5, false, 20, true)).toBe(CROWD_POOL)
    // Farther out it stays modest: the figures there are tiny.
    expect(crowdCount(16.5, false, 20, true)).toBeLessThan(24)
  })

  it("notices a busy place within 200 m", () => {
    const square = { lat: 0.3134, lng: 32.5808 }
    expect(busyStreet({ lat: 0.3135, lng: 32.581 }, [square])).toBe(true)
    expect(busyStreet({ lat: 0.32, lng: 32.59 }, [square])).toBe(false)
  })

  it("follows a road that keeps their direction", () => {
    const graph = corner()
    const person = spawnCrowdPerson(graph, ["e1"], 0, 1)!
    person.edgeId = "e1"
    person.direction = 1
    person.headingPref = 0
    person.wander = 1
    person.distance = graph.edges.e1!.lengthMeters - 1
    stepCrowdPerson(graph, person, 3)
    expect(person.edgeId).toBe("e2")
    expect(person.direction).toBe(1)
    expect(person.distance).toBeGreaterThan(0)
    expect(person.distance).toBeLessThan(graph.edges.e2!.lengthMeters)
  })

  it("follows the street around a corner instead of snapping back", () => {
    const graph = corner()
    const person = spawnCrowdPerson(graph, ["e1"], 0, 1)!
    person.edgeId = "e1"
    person.direction = 1
    person.headingPref = Math.PI / 2
    person.wander = 1
    person.distance = graph.edges.e1!.lengthMeters - 1
    stepCrowdPerson(graph, person, 3)
    expect(person.edgeId).toBe("e2")
    expect(person.direction).toBe(1)
  })

  it("gives each person their own pace", () => {
    const graph = corner()
    const people = [0, 1, 2].map((slot) => spawnCrowdPerson(graph, ["e1", "e2", "e3"], slot, 9)!)
    expect(new Set(people.map((person) => person.speed.toFixed(3))).size).toBeGreaterThan(1)
  })

  it("keeps a gap behind someone walking the same way", () => {
    const graph = corner()
    const front = spawnCrowdPerson(graph, ["e1"], 0, 1)!
    const back = spawnCrowdPerson(graph, ["e1"], 1, 1)!
    front.edgeId = "e1"
    back.edgeId = "e1"
    front.direction = 1
    back.direction = 1
    front.distance = 20
    back.distance = 19
    separateCrowd(graph, [front, back])
    expect(front.distance - back.distance).toBeGreaterThanOrEqual(4)
  })

  it("turns around at a dead end", () => {
    const graph = corner()
    const person = spawnCrowdPerson(graph, ["e3"], 1, 2)!
    person.edgeId = "e3"
    person.direction = 1
    person.distance = graph.edges.e3!.lengthMeters - 0.2
    stepCrowdPerson(graph, person, 2)
    expect(person.edgeId).toBe("e3")
    expect(person.direction).toBe(-1)
  })

  it("walks near the roadside, inside the road's edge", () => {
    const graph = corner()
    const person = spawnCrowdPerson(graph, ["e1"], 2, 3)!
    // A residential street is ~6.4 m wide: 1.7–2.6 m off the centre line.
    person.edgeId = "e1"
    person.distance = graph.edges.e1!.lengthMeters / 2
    const place = crowdPlace(graph, person)!
    const onRoad = {
      lat: (graph.edges.e1!.coordinates[0].lat + graph.edges.e1!.coordinates[1].lat) / 2,
      lng: (graph.edges.e1!.coordinates[0].lng + graph.edges.e1!.coordinates[1].lng) / 2
    }
    const off = haversineDistanceMeters(onRoad, place)
    expect(off).toBeGreaterThan(1.6)
    expect(off).toBeLessThan(2.7)
  })

  it("keeps closer in on narrow roads and further out on avenues", () => {
    expect(roadsideOffset("footway", 0.5)).toBeLessThan(roadsideOffset("residential", 0.5))
    expect(roadsideOffset("trunk", 0.5)).toBeGreaterThan(4)
    expect(roadsideOffset("footway", 1)).toBeGreaterThanOrEqual(0.3)
    expect(roadsideOffset("unknown_class", 0)).toBeLessThan(3)
  })

  it("keeps roads in the spawn ring and drops ones farther out", () => {
    const graph = corner()
    const near = edgesNear(graph, { lat: 0.31, lng: 32.58 })
    expect(near).toContain("e1")
    expect(near).not.toContain("e2")
  })

  it("takes a wider ring when asked (respawning out of sight)", () => {
    const graph = corner()
    expect(edgesNear(graph, { lat: 0.31, lng: 32.58 }, 60, 220)).toContain("e2")
  })

  it("keeps three of every eight slots for a group standing about", () => {
    expect([0, 1, 2, 3, 7, 8, 10, 11].map((slot) => groupSlot(slot))).toEqual([
      { leader: 0, member: 0 },
      { leader: 0, member: 1 },
      { leader: 0, member: 2 },
      null,
      null,
      { leader: 8, member: 0 },
      { leader: 8, member: 2 },
      null
    ])
  })

  it("puts a group on one spot off the road, each their own person, and they stay put", () => {
    const graph = corner()
    const group = spawnCrowdGroup(graph, ["e1"], 0, 5, 3)!
    expect(group).toHaveLength(3)
    expect(new Set(group.map((p) => p.look)).size).toBe(3)
    expect(new Set(group.map((p) => `${p.edgeId}:${p.distance}:${p.side}`)).size).toBe(1)
    expect(group.every((p) => p.still?.size === 3)).toBe(true)
    const before = { ...group[0]! }
    stepCrowdPerson(graph, group[0]!, 1, 5)
    expect(group[0]!.distance).toBe(before.distance)
    // Beyond the road's edge: further out than any walker on that street.
    const walker = { ...group[0]!, still: null, lane: 0 }
    const centre = getRoadCoordinate(graph, { edgeId: "e1", distanceAlongEdge: group[0]!.distance, direction: group[0]!.direction })!
    expect(haversineDistanceMeters(centre, crowdPlace(graph, group[0]!)!)).toBeGreaterThan(haversineDistanceMeters(centre, crowdPlace(graph, walker)!) + 1)
  })
})
