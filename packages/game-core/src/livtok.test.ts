import { describe, expect, it } from "vitest"
import {
  LIVTOK_BALES,
  LIVTOK_DELIVERY,
  followerChange,
  liveNet,
  openBale,
  pieceCost,
  piecePrice,
  saleChance,
  startViewers,
  viewerCeiling
} from "./livtok.js"

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

describe("LivTok bales", () => {
  it("opens a bale into exactly its pieces, usually about 30 / 50 / 20", () => {
    const random = seeded(7)
    let first = 0
    let third = 0
    for (let i = 0; i < 300; i++) {
      const counts = openBale("tops", random)
      expect(counts.first + counts.second + counts.third).toBe(100)
      expect(Math.min(counts.first, counts.second, counts.third)).toBeGreaterThanOrEqual(0)
      first += counts.first
      third += counts.third
    }
    // Averaged over many bales (bad bales included).
    expect(first / 300).toBeGreaterThan(20)
    expect(first / 300).toBeLessThan(32)
    expect(third / 300).toBeGreaterThan(18)
  })

  it("makes every grade sell above its cost at a fair price, except third class in a pricey bale", () => {
    for (const bale of LIVTOK_BALES) {
      expect(piecePrice(bale.id, "first", "fair")).toBeGreaterThan(pieceCost(bale.id))
      expect(piecePrice(bale.id, "second", "fair")).toBeGreaterThan(pieceCost(bale.id))
    }
    expect(piecePrice("tops", "first", "high")).toBeGreaterThan(piecePrice("tops", "first", "fair"))
    expect(piecePrice("tops", "first", "low")).toBeLessThan(piecePrice("tops", "first", "fair"))
  })
})

describe("LivTok live", () => {
  it("sells more often when cheaper, answered well and watched", () => {
    const base = { answer: "good", viewers: 20, grade: "second" } as const
    expect(saleChance({ ...base, level: "low" })).toBeGreaterThan(saleChance({ ...base, level: "fair" }))
    expect(saleChance({ ...base, level: "fair" })).toBeGreaterThan(saleChance({ ...base, level: "high" }))
    expect(saleChance({ ...base, level: "fair", answer: "ignored" })).toBeLessThan(saleChance({ ...base, level: "fair" }))
    expect(saleChance({ ...base, level: "fair", viewers: 3 })).toBeLessThan(saleChance({ ...base, level: "fair" }))
  })

  it("grows the crowd with followers, up to a ceiling", () => {
    expect(startViewers(0)).toBe(8)
    expect(startViewers(400)).toBeGreaterThan(startViewers(50))
    expect(viewerCeiling(1_000_000)).toBe(400)
  })

  it("pays the paid orders minus delivery, never below zero", () => {
    expect(liveNet([5_000, 9_000])).toBe(14_000 - 2 * LIVTOK_DELIVERY)
    expect(liveNet([])).toBe(0)
  })

  it("gains followers for sales and a crowd, loses some for buyers who vanish", () => {
    expect(followerChange({ sold: 20, ghosts: 2, peakViewers: 60 })).toBe(13)
    expect(followerChange({ sold: 0, ghosts: 3, peakViewers: 10 })).toBeLessThan(0)
  })

  it("hits roughly the tier 2 target with a mixed-tops bale (~60k a live)", () => {
    // 20 pieces sold at fair prices from a typical 30/50/20 bale, 12% ghosting.
    const prices = [
      ...Array(6).fill(piecePrice("tops", "first", "fair")),
      ...Array(10).fill(piecePrice("tops", "second", "fair")),
      ...Array(4).fill(piecePrice("tops", "third", "fair"))
    ]
    const paid = prices.slice(0, Math.round(prices.length * 0.88))
    const profit = liveNet(paid) - prices.length * pieceCost("tops")
    expect(profit).toBeGreaterThan(40_000)
    expect(profit).toBeLessThan(90_000)
  })
})
