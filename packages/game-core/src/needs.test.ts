import { describe, expect, it } from "vitest"
import {
  COLLAPSE_RECOVERY_HEALTH,
  NEED_MAX,
  SPRINT_MULTIPLIER,
  applySprint,
  currentNeeds,
  eat,
  speedMultiplier
} from "./needs.js"

const at = new Date("2026-10-14T08:00:00Z")
const hoursLater = (h: number) => new Date(at.getTime() + h * 3_600_000)

describe("currentNeeds", () => {
  it("refills energy from empty in about four hours", () => {
    const stored = { energy: 0, health: 50, at, restingSince: null }
    expect(currentNeeds(stored, hoursLater(2)).energy).toBeCloseTo(50)
    expect(currentNeeds(stored, hoursLater(4)).energy).toBe(NEED_MAX)
    expect(currentNeeds(stored, hoursLater(10)).energy).toBe(NEED_MAX)
  })

  it("heals much faster while resting at home", () => {
    const awake = currentNeeds({ energy: 50, health: 20, at, restingSince: null }, hoursLater(1))
    const asleep = currentNeeds({ energy: 50, health: 20, at, restingSince: at }, hoursLater(1))
    expect(asleep.health).toBeGreaterThan(awake.health + 40)
  })

  it("never goes backwards in time", () => {
    const stored = { energy: 30, health: 30, at, restingSince: null }
    expect(currentNeeds(stored, hoursLater(-1))).toEqual({ energy: 30, health: 30 })
  })
})

describe("applySprint", () => {
  it("burns energy first", () => {
    const tick = applySprint({ energy: 100, health: 100 }, 9)
    expect(tick.energy).toBeCloseTo(80)
    expect(tick.health).toBe(100)
    expect(tick.collapsed).toBe(false)
  })

  it("a full tank lasts about 45 seconds", () => {
    expect(applySprint({ energy: 100, health: 100 }, 44.9).energy).toBeGreaterThan(0)
    expect(applySprint({ energy: 100, health: 100 }, 45).energy).toBe(0)
  })

  it("charges health only for the part of the tick spent empty", () => {
    const tick = applySprint({ energy: 1, health: 100 }, 1)
    expect(tick.energy).toBe(0)
    expect(tick.health).toBeLessThan(100)
    expect(tick.health).toBeGreaterThan(92)
  })

  it("collapses at zero health and gets up with some health back", () => {
    const tick = applySprint({ energy: 0, health: 3 }, 1)
    expect(tick.collapsed).toBe(true)
    expect(tick.health).toBe(COLLAPSE_RECOVERY_HEALTH)
  })
})

describe("speedMultiplier", () => {
  it("caps the edge at the sprint multiplier and stops collapsed runners", () => {
    expect(speedMultiplier(false, false)).toBe(1)
    expect(speedMultiplier(true, false)).toBe(SPRINT_MULTIPLIER)
    expect(speedMultiplier(true, true)).toBe(0)
  })
})

describe("eat", () => {
  it("refills and caps at the max", () => {
    expect(eat({ energy: 10, health: 50 }, "rolex")).toEqual({ energy: 45, health: 50 })
    expect(eat({ energy: 90, health: 90 }, "plate")).toEqual({ energy: 100, health: 100 })
  })
})
