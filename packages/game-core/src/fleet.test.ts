import { describe, expect, it } from "vitest"
import {
  FLEET_EVENTS,
  FLEET_MODELS,
  FLEET_SHIFT_SECONDS,
  RUN_SECONDS,
  STARTER_FLEET,
  breakdownChance,
  fleetBikePrice,
  fleetBikeValue,
  fleetServiceCost,
  hireRider,
  pickFleetEvent,
  runDues,
  wearFactor,
  type FleetEventKind
} from "./fleet.js"
import { findTierById } from "./tiers.js"

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

describe("Fleet bikes", () => {
  it("the starter fleet fits in what moving up puts in", () => {
    expect(fleetBikePrice(STARTER_FLEET.model) * STARTER_FLEET.count).toBeLessThanOrEqual(findTierById("town").invest)
  })

  it("better bikes cost more and earn more", () => {
    const prices = FLEET_MODELS.map((model) => fleetBikePrice(model.id))
    const dues = FLEET_MODELS.map((model) => model.duesPerMinute)
    expect([...prices].sort((a, b) => a - b)).toEqual(prices)
    expect([...dues].sort((a, b) => a - b)).toEqual(dues)
  })

  it("a bike pays for itself in about 15–25 minutes on the road", () => {
    for (const model of FLEET_MODELS) {
      const minutes = fleetBikePrice(model.id) / model.duesPerMinute
      expect(minutes).toBeGreaterThan(15)
      expect(minutes).toBeLessThan(25)
    }
  })

  it("wear lowers dues and raises breakdowns", () => {
    expect(wearFactor(0)).toBe(1)
    expect(wearFactor(40)).toBe(1)
    expect(wearFactor(100)).toBeCloseTo(0.6)
    expect(breakdownChance(0)).toBeLessThan(0.02)
    expect(breakdownChance(90)).toBeGreaterThan(0.3)
    expect(fleetServiceCost(0)).toBe(0)
    expect(fleetServiceCost(100)).toBe(150_000)
    expect(fleetBikeValue("boxa100", 100)).toBe(fleetBikePrice("boxa100") / 2)
  })

  it("run dues follow time, rider, wear and fuel (electric ignores fuel)", () => {
    const base = runDues({ model: "boxa100", seconds: 60, skill: 1, wear: 0, fuelSpike: false })
    expect(base).toBe(25_000)
    expect(runDues({ model: "boxa100", seconds: 60, skill: 1, wear: 0, fuelSpike: true })).toBe(20_000)
    expect(runDues({ model: "zemboE", seconds: 60, skill: 1, wear: 0, fuelSpike: true })).toBe(36_000)
    expect(runDues({ model: "boxa100", seconds: 60, skill: 1.1, wear: 100, fuelSpike: false })).toBe(16_500)
  })

  it("riders get different names while there are names left", () => {
    const random = seeded(7)
    const taken: string[] = []
    for (let i = 0; i < 10; i++) {
      const { rider, skill } = hireRider(random, taken)
      expect(taken).not.toContain(rider)
      expect(skill).toBeGreaterThanOrEqual(0.85)
      expect(skill).toBeLessThanOrEqual(1.15)
      taken.push(rider)
    }
  })
})

describe("Fleet shifts", () => {
  it("picks only allowed events, in proportion to their weights", () => {
    const random = seeded(3)
    const allowed: FleetEventKind[] = ["crash", "fuel"]
    const seen = { crash: 0, fuel: 0 } as Record<string, number>
    for (let i = 0; i < 3000; i++) seen[pickFleetEvent(random, allowed)!]! += 1
    const share = seen.crash! / 3000
    const expected = FLEET_EVENTS.crash.weight / (FLEET_EVENTS.crash.weight + FLEET_EVENTS.fuel.weight)
    expect(Math.abs(share - expected)).toBeLessThan(0.05)
    expect(pickFleetEvent(random, [])).toBeNull()
  })

  it("the starter fleet earns millions an hour (tier 3 pace, §18)", () => {
    // Four Boxas on the road ~80% of a shift (the rest: back between runs, events).
    const onRoadSeconds = FLEET_SHIFT_SECONDS * 0.8
    const perShift = STARTER_FLEET.count * runDues({ model: "boxa100", seconds: onRoadSeconds, skill: 1, wear: 20, fuelSpike: false })
    const shiftsAnHour = 3600 / (FLEET_SHIFT_SECONDS + 30)
    const perHour = perShift * shiftsAnHour
    expect(perHour).toBeGreaterThan(3_500_000)
    expect(perHour).toBeLessThan(6_500_000)
    expect(RUN_SECONDS[0]).toBeLessThan(RUN_SECONDS[1])
  })
})
