import { describe, expect, it } from "vitest"
import { haversineDistanceMeters } from "./geo.js"
import {
  KIKUUBO_SPOTS,
  PORTER_MAX_METERS,
  PORTER_MIN_METERS,
  findSpot,
  makePorterOffer,
  porterEnergyCost,
  porterPay,
  porterTimeLimit
} from "./hustles.js"

// Small deterministic generator for repeatable offers.
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32
    return state / 2 ** 32
  }
}

describe("porter pay", () => {
  it("stays in the planned 1,000–2,500 band for light loads, more for heavy", () => {
    expect(porterPay(150, false)).toBe(1200)
    expect(porterPay(500, false)).toBe(2500)
    expect(porterPay(500, true)).toBeGreaterThan(porterPay(500, false))
  })

  it("costs energy and gives enough time", () => {
    expect(porterEnergyCost(150, false)).toBeCloseTo(4.5)
    expect(porterEnergyCost(500, true)).toBe(10)
    expect(porterTimeLimit(500)).toBeGreaterThan(500 / 18)
  })
})

describe("porter offers", () => {
  it("always join two different shops a sensible distance apart", () => {
    const random = seeded(7)
    for (let i = 0; i < 200; i++) {
      const offer = makePorterOffer(`o${i}`, 0, random)
      expect(offer.pickupId).not.toBe(offer.dropoffId)
      const a = findSpot(offer.pickupId)!
      const b = findSpot(offer.dropoffId)!
      const meters = haversineDistanceMeters(a.position, b.position)
      expect(meters).toBeGreaterThanOrEqual(PORTER_MIN_METERS)
      expect(meters).toBeLessThanOrEqual(PORTER_MAX_METERS)
      expect(offer.pay).toBe(porterPay(meters, offer.heavy))
    }
  })

  it("has unique spot ids", () => {
    expect(new Set(KIKUUBO_SPOTS.map((spot) => spot.id)).size).toBe(KIKUUBO_SPOTS.length)
  })
})
