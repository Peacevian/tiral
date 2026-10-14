import { describe, expect, it } from "vitest"
import { FRESH_ZONE, ROLEX_FLIP_WINDOW, applyWash, carPayout, pickCar, rolexSale, scoreFlip } from "./stalls.js"

describe("rolex timing", () => {
  it("scores flips around the window", () => {
    const middle = (ROLEX_FLIP_WINDOW.start + ROLEX_FLIP_WINDOW.end) / 2
    expect(scoreFlip(middle)).toBe("perfect")
    expect(scoreFlip(ROLEX_FLIP_WINDOW.start + 0.05)).toBe("good")
    expect(scoreFlip(1)).toBe("raw")
    expect(scoreFlip(9)).toBe("burnt")
  })

  it("sells by quality", () => {
    expect(rolexSale("perfect")).toBe(2500)
    expect(rolexSale("good")).toBe(2000)
    expect(rolexSale("raw")).toBe(1000)
    expect(rolexSale("burnt")).toBe(0)
  })
})

describe("car wash", () => {
  it("pays full (with a quick tip), by share, or nothing", () => {
    expect(carPayout({ carId: "saloon", cleanZones: 12, secondsUsed: 20 })).toMatchObject({ pay: 8000, tip: 800, net: 8300 })
    expect(carPayout({ carId: "saloon", cleanZones: 12, secondsUsed: 120 })).toMatchObject({ pay: 8000, tip: 0, net: 7500 })
    expect(carPayout({ carId: "taxi", cleanZones: 16, secondsUsed: 90 }).pay).toBe(12000)
    expect(carPayout({ carId: "saloon", cleanZones: 6, secondsUsed: 60 }).net).toBe(0)
  })

  it("picks cars by weight", () => {
    expect(pickCar(0).id).toBe("saloon")
    expect(pickCar(0.99).id).toBe("taxi")
  })

  it("needs soap, then scrubbing, then rinsing", () => {
    let zone = FRESH_ZONE
    // Rinsing a dirty zone does nothing useful.
    expect(applyWash(zone, "rinse").clean).toBe(false)
    // Scrubbing without soap barely helps.
    expect(applyWash(zone, "scrub").dirt).toBeCloseTo(0.96)
    zone = applyWash(applyWash(zone, "soap"), "soap")
    for (let i = 0; i < 5; i++) zone = applyWash(zone, "scrub")
    expect(zone.dirt).toBeLessThanOrEqual(0.15)
    for (let i = 0; i < 3 && !zone.clean; i++) zone = applyWash(zone, "rinse")
    expect(zone.clean).toBe(true)
  })
})
