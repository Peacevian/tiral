import { describe, expect, it } from "vitest"
import { TIERS, findTierById, nextTier, tierSavings } from "./tiers.js"

describe("career tiers", () => {
  it("climbs street → small → town → big → tycoon at the agreed capital", () => {
    expect(TIERS.map((tier) => [tier.id, tier.capital])).toEqual([
      ["street", 0],
      ["small", 500_000],
      ["town", 5_000_000],
      ["big", 50_000_000],
      ["tycoon", 250_000_000]
    ])
    expect(nextTier("street")?.id).toBe("small")
    expect(nextTier("tycoon")).toBeNull()
  })

  it("puts part of the capital into the first business, never more than it", () => {
    for (const tier of TIERS) expect(tier.invest).toBeLessThanOrEqual(tier.capital)
    expect(findTierById("small").invest).toBe(150_000)
  })

  it("measures savings towards the next tier", () => {
    expect(tierSavings("street", 230_000)).toMatchObject({ have: 230_000, need: 500_000, share: 0.46, ready: false })
    expect(tierSavings("street", 800_000)).toMatchObject({ have: 500_000, share: 1, ready: true })
    expect(tierSavings("street", -5)).toMatchObject({ have: 0, ready: false })
    expect(tierSavings("tycoon", 1e9)).toBeNull()
  })

  it("falls back to street jobs for an unknown id", () => {
    expect(findTierById("nope").id).toBe("street")
  })
})
