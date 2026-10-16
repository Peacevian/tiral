import { describe, expect, it } from "vitest"
import { HOSTED_MAX_LEAD_MS, HOSTED_MIN_LEAD_MS, PRIZE_SPLIT_PRESETS, prizeProblem, splitPrize } from "./prizes.js"

const now = new Date("2026-10-16T12:00:00Z")
const valid = { pot: 20_000, shares: [50, 30, 20], message: "Kikuubo kings", startsAt: new Date(now.getTime() + 60 * 60_000), countdownSeconds: 60 }

describe("splitPrize", () => {
  it("takes 10% and pays the rest in the host's shares", () => {
    expect(splitPrize(20_000, [50, 30, 20], 3)).toEqual({ payouts: [9_000, 5_400, 3_600], cut: 2_000, unclaimed: 0 })
  })

  it("pays everything (minus the cut) to a lone winner", () => {
    expect(splitPrize(10_000, [100], 1)).toEqual({ payouts: [9_000], cut: 1_000, unclaimed: 0 })
  })

  it("returns places nobody reached to the host", () => {
    expect(splitPrize(20_000, [50, 30, 20], 1)).toEqual({ payouts: [9_000], cut: 2_000, unclaimed: 9_000 })
    expect(splitPrize(20_000, [50, 30, 20], 0)).toEqual({ payouts: [], cut: 2_000, unclaimed: 18_000 })
  })

  it("never pays out more than the pot, and rounding dust goes to the cut", () => {
    for (const pot of [1_000, 1_001, 3_333, 12_345, 99_999]) {
      for (const preset of PRIZE_SPLIT_PRESETS) {
        for (let winners = 0; winners <= preset.shares.length; winners++) {
          const split = splitPrize(pot, preset.shares, winners)
          const total = split.payouts.reduce((sum, amount) => sum + amount, 0) + split.cut + split.unclaimed
          expect(total).toBe(pot)
          expect(split.cut).toBeGreaterThanOrEqual(Math.floor(pot * 0.1))
          for (const amount of split.payouts) expect(Number.isInteger(amount)).toBe(true)
        }
      }
    }
  })
})

describe("prizeProblem", () => {
  it("accepts a normal setup", () => {
    expect(prizeProblem(valid, now)).toBeNull()
  })

  it("checks pot, winners and shares", () => {
    expect(prizeProblem({ ...valid, pot: 999 }, now)).toBe("pot_too_small")
    expect(prizeProblem({ ...valid, pot: 1_500.5 }, now)).toBe("pot_not_whole")
    expect(prizeProblem({ ...valid, shares: [] }, now)).toBe("winners")
    expect(prizeProblem({ ...valid, shares: [20, 20, 20, 20, 10, 10] }, now)).toBe("winners")
    expect(prizeProblem({ ...valid, shares: [97, 3] }, now)).toBe("share_too_small")
    expect(prizeProblem({ ...valid, shares: [60, 30] }, now)).toBe("shares_total")
  })

  it("keeps the start between 15 minutes and 7 days ahead", () => {
    expect(prizeProblem({ ...valid, startsAt: new Date(now.getTime() + HOSTED_MIN_LEAD_MS - 1) }, now)).toBe("too_soon")
    expect(prizeProblem({ ...valid, startsAt: new Date(now.getTime() + HOSTED_MIN_LEAD_MS) }, now)).toBeNull()
    expect(prizeProblem({ ...valid, startsAt: new Date(now.getTime() + HOSTED_MAX_LEAD_MS) }, now)).toBeNull()
    expect(prizeProblem({ ...valid, startsAt: new Date(now.getTime() + HOSTED_MAX_LEAD_MS + 1) }, now)).toBe("too_far")
    expect(prizeProblem({ ...valid, startsAt: new Date("nonsense") }, now)).toBe("too_soon")
  })

  it("only allows the offered countdowns and short messages", () => {
    expect(prizeProblem({ ...valid, countdownSeconds: 45 }, now)).toBe("countdown")
    expect(prizeProblem({ ...valid, message: "x".repeat(61) }, now)).toBe("message_too_long")
  })
})
