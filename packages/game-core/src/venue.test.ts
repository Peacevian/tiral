import { describe, expect, it } from "vitest"
import { KYADONDO, KYADONDO_BLOCKS, VENUE_MENU, roundPrice, standable, walkStep } from "./venue.js"

describe("Kyadondo", () => {
  it("you can stand where you arrive and at both counters", () => {
    expect(standable(KYADONDO.arrival)).toBe(true)
    // In front of the counters (the side facing the pitch).
    expect(standable({ x: KYADONDO.counters.grill.x, z: 45.2 })).toBe(true)
    expect(standable({ x: KYADONDO.counters.bar.x, z: 44.8 })).toBe(true)
  })

  it("buildings, the stage and tents are solid; you slide along them", () => {
    expect(standable({ x: 0, z: -40 })).toBe(false) // clubhouse
    expect(standable({ x: 26, z: 50 })).toBe(false) // stage
    expect(standable({ x: -18, z: 36 })).toBe(false) // a tent's table
    // Walking diagonally into the stage's front edge slides along it.
    const slid = walkStep({ x: 20, z: 44.2 }, { x: 20.5, z: 44.8 })
    expect(slid.z).toBeCloseTo(44.2)
    expect(slid.x).toBeCloseTo(20.5)
    // Straight into the clubhouse wall: no step at all.
    expect(walkStep({ x: 0, z: -34.5 }, { x: 0, z: -34.8 })).toEqual({ x: 0, z: -34.5 })
    expect(KYADONDO_BLOCKS.length).toBeGreaterThan(20)
  })

  it("prices are real Kampala prices and a round is a beer each", () => {
    expect(VENUE_MENU.find((item) => item.id === "beer")?.price).toBe(7_000)
    expect(roundPrice(4)).toBe(28_000)
  })
})
