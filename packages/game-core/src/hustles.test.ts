import { describe, expect, it } from "vitest"
import { haversineDistanceMeters } from "./geo.js"
import {
  BODA_MAX_METERS,
  BODA_MIN_METERS,
  BODA_STAGES,
  KIKUUBO_SPOTS,
  bodaExpectedSeconds,
  bodaFare,
  bodaFullFareSeconds,
  bodaPayout,
  findPlace,
  isRushHour,
  makeBodaOffer,
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
  it("pays ~1,900–3,800 for light loads (§18.1), more for heavy", () => {
    expect(porterPay(150, false)).toBe(1900)
    expect(porterPay(500, false)).toBe(3800)
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

describe("boda", () => {
  it("prices fares by distance, with a rush-hour bump", () => {
    expect(bodaFare(2000, false)).toBe(21600)
    expect(bodaFare(2000, true)).toBe(32400)
  })

  it("knows Kampala rush hour (UTC+3)", () => {
    expect(isRushHour(new Date("2026-10-14T05:30:00Z"))).toBe(true) // 08:30
    expect(isRushHour(new Date("2026-10-14T09:00:00Z"))).toBe(false) // 12:00
    expect(isRushHour(new Date("2026-10-14T15:00:00Z"))).toBe(true) // 18:00
  })

  it("pays quick rides a tip, halves late ones, and takes fuel off the top", () => {
    const fare = bodaFare(2000, false)
    const quick = bodaPayout({ fare, meters: 2000, seconds: bodaExpectedSeconds(2000), fuelMeters: 2300 })
    expect(quick.tip).toBeGreaterThan(0)
    expect(quick.fuel).toBe(460)
    expect(quick.net).toBe(quick.fare + quick.tip - quick.fuel)
    const late = bodaPayout({ fare, meters: 2000, seconds: bodaFullFareSeconds(2000) + 1, fuelMeters: 2300 })
    expect(late.late).toBe(true)
    expect(late.fare).toBe(10800)
    expect(late.tip).toBe(0)
    // Fuel never makes a ride cost money.
    expect(bodaPayout({ fare: 500, meters: 500, seconds: 999, fuelMeters: 9000 }).net).toBe(0)
  })

  it("offers rides between a stage and a destination a sensible distance apart", () => {
    const random = seeded(3)
    for (let i = 0; i < 200; i++) {
      const offer = makeBodaOffer(`b${i}`, Date.parse("2026-10-14T09:00:00Z"), random)
      const meters = haversineDistanceMeters(findPlace(offer.pickupId)!.position, findPlace(offer.dropoffId)!.position)
      expect(meters).toBeGreaterThanOrEqual(BODA_MIN_METERS)
      expect(meters).toBeLessThanOrEqual(BODA_MAX_METERS)
      expect(BODA_STAGES.some((stage) => stage.id === offer.pickupId)).toBe(true)
    }
  })
})
