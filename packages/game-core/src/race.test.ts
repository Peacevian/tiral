import { describe, expect, it } from "vitest"
import { KAMPALA_ZONE } from "./zone.js"
import { haversineDistanceMeters } from "./geo.js"
import { MIN_BOUNTY_DISTANCE_METERS, chooseBounty, distinctRacers } from "./race.js"

const bounties = KAMPALA_ZONE.bountyLocations

function candidatesFor(starts: Array<{ lat: number; lng: number }>) {
  return bounties.map((bounty) => ({
    item: bounty.id,
    nearestStartMeters: Math.min(...starts.map((start) => haversineDistanceMeters(start, bounty.position)))
  }))
}

describe("chooseBounty", () => {
  it("never picks the bounty a racer is standing on", () => {
    for (const bounty of bounties) {
      for (let roll = 0; roll < 1; roll += 0.05) {
        expect(chooseBounty(candidatesFor([bounty.position]), roll)).not.toBe(bounty.id)
      }
    }
  })

  it("never picks City Square for someone on the default Kampala Road start (~40 m away)", () => {
    const kampalaRoad = KAMPALA_ZONE.startPoints[0]!.position
    for (let roll = 0; roll < 1; roll += 0.05) {
      expect(chooseBounty(candidatesFor([kampalaRoad]), roll)).not.toBe("bounty-city-square")
    }
  })

  it("prefers spots far from everyone, and falls back to the furthest when none are", () => {
    expect(chooseBounty([{ item: "near", nearestStartMeters: 50 }, { item: "far", nearestStartMeters: MIN_BOUNTY_DISTANCE_METERS }], 0.9)).toBe("far")
    expect(chooseBounty([{ item: "a", nearestStartMeters: 100 }, { item: "b", nearestStartMeters: 300 }], 0)).toBe("b")
    expect(chooseBounty([], 0.5)).toBeNull()
  })
})

describe("distinctRacers", () => {
  it("counts one account once, however many tabs it races from", () => {
    expect(distinctRacers(["u1", "u1"])).toBe(1)
    expect(distinctRacers(["u1", "u2", "u1"])).toBe(2)
    expect(distinctRacers([null, null, "u1"])).toBe(3)
  })
})
