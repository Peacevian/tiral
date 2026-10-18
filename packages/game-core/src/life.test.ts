import { describe, expect, it } from "vitest"
import {
  HOUR_MS,
  LIFE_EVENTS,
  RENT_PERIOD_HOURS,
  STRESS,
  currentStress,
  eventsDue,
  pickLifeEvent,
  settleRent
} from "./life.js"

const now = new Date("2026-10-14T12:00:00Z")
const ago = (hours: number) => new Date(now.getTime() - hours * HOUR_MS)

describe("settleRent", () => {
  it("does nothing before rent is due", () => {
    const due = new Date(now.getTime() + HOUR_MS)
    const result = settleRent({ tier: "kisenyi", rentDueAt: due, balance: 100_000 }, now)
    expect(result.charged).toBe(0)
    expect(result.notices).toEqual([])
    expect(result.rentDueAt).toEqual(due)
  })

  it("charges one period and moves the due date on", () => {
    const result = settleRent({ tier: "kisenyi", rentDueAt: ago(1), balance: 50_000 }, now)
    expect(result.charged).toBe(35_000)
    expect(result.tier).toBe("kisenyi")
    expect(result.stressDelta).toBe(STRESS.rentPaid)
    expect(result.rentDueAt.getTime()).toBe(ago(1).getTime() + RENT_PERIOD_HOURS * HOUR_MS)
  })

  it("moves you down a tier when you can't pay (never homeless)", () => {
    const result = settleRent({ tier: "ntinda", rentDueAt: ago(1), balance: 10_000 }, now)
    expect(result.charged).toBe(0)
    expect(result.tier).toBe("kawempe")
    expect(result.notices[0]).toMatchObject({ kind: "evicted", from: "ntinda", to: "kawempe" })
    expect(result.stressDelta).toBe(STRESS.rentMissed)
  })

  it("lets rent slide at the cheapest tier, with stress", () => {
    const result = settleRent({ tier: "kisenyi", rentDueAt: ago(1), balance: 0 }, now)
    expect(result.tier).toBe("kisenyi")
    expect(result.notices[0]?.kind).toBe("rent_grace")
  })

  it("settles several missed periods after a long absence, capped", () => {
    const result = settleRent({ tier: "kisenyi", rentDueAt: ago(RENT_PERIOD_HOURS * 2 + 1), balance: 1_000_000 }, now)
    expect(result.charged).toBe(35_000 * 3)
    const longGone = settleRent({ tier: "kisenyi", rentDueAt: ago(RENT_PERIOD_HOURS * 100), balance: 0 }, now)
    expect(longGone.notices.length).toBe(8)
    expect(longGone.rentDueAt.getTime()).toBeGreaterThan(now.getTime())
  })
})

describe("stress", () => {
  it("eases off over time and never goes below zero", () => {
    expect(currentStress(50, ago(5), now)).toBe(40)
    expect(currentStress(10, ago(100), now)).toBe(0)
  })
})

describe("events", () => {
  it("are owed once per interval, capped by pending requests", () => {
    expect(eventsDue(null, now, 0)).toBe(0)
    expect(eventsDue(ago(3), now, 0)).toBe(0)
    expect(eventsDue(ago(17), now, 0)).toBe(2)
    expect(eventsDue(ago(17), now, 1)).toBe(1)
    expect(eventsDue(ago(100), now, 2)).toBe(0)
  })

  it("picks by weight and can avoid repeats", () => {
    expect(pickLifeEvent(0).id).toBe(LIFE_EVENTS[0].id)
    expect(pickLifeEvent(0.999).id).toBe(LIFE_EVENTS[LIFE_EVENTS.length - 1]!.id)
    expect(pickLifeEvent(0, ["maama_hospital"]).id).not.toBe("maama_hospital")
  })
})

describe("Big homes", () => {
  it("need the career tier their landlord asks for", async () => {
    const { homeOpenTo, HOUSING_TIERS } = await import("./life.js")
    expect(homeOpenTo("kololo", "street")).toBe(true)
    expect(homeOpenTo("muyenga", "small")).toBe(false)
    expect(homeOpenTo("muyenga", "town")).toBe(true)
    expect(homeOpenTo("naguru", "town")).toBe(false)
    expect(homeOpenTo("naguru", "tycoon")).toBe(true)
    expect(homeOpenTo("munyonyo", "big")).toBe(false)
    // Rent goes up with every step.
    const rents = HOUSING_TIERS.map((tier) => tier.rent)
    expect([...rents].sort((a, b) => a - b)).toEqual(rents)
  })
})
