// Career tiers: street jobs to tycoon (docs/economy-progress.md §18). Each
// tier changes what you do (work → sell → manage → invest); moving up takes
// experience in the tier below plus capital, part of which goes into your
// first business there. Tycoon is a title, measured by net worth.

export type TierId = "street" | "small" | "town" | "big" | "tycoon"

export const TIERS: ReadonlyArray<{
  id: TierId
  name: string
  /** What you do in this tier. */
  verb: string
  /** Coins (or net worth, for Tycoon) needed to move up into this tier. */
  capital: number
  /** The part of it that goes into your first business there. */
  invest: number
  /** What the tier is made of, for the career path. */
  blurb: string
}> = [
  { id: "street", name: "Street jobs", verb: "Work", capital: 0, invest: 0, blurb: "Porter, car wash, boda, rolex stand" },
  { id: "small", name: "Small business", verb: "Sell", capital: 500_000, invest: 150_000, blurb: "Sell clothes on live, mobile money kiosk" },
  { id: "town", name: "Town business", verb: "Manage", capital: 5_000_000, invest: 2_000_000, blurb: "Boda fleet, Kikuubo wholesale shop" },
  { id: "big", name: "Big business", verb: "Invest", capital: 50_000_000, invest: 20_000_000, blurb: "Rental rooms, bale imports, property" },
  { id: "tycoon", name: "Tycoon", verb: "Title", capital: 250_000_000, invest: 0, blurb: "Top of the Kampala Rich List" }
]

export function findTierById(id: string) {
  return TIERS.find((tier) => tier.id === id) ?? TIERS[0]!
}

/** The tier after this one (null at the top). */
export function nextTier(id: TierId) {
  const index = TIERS.findIndex((tier) => tier.id === id)
  return TIERS[index + 1] ?? null
}

/**
 * How far savings are towards the next tier's capital: "230,000 / 500,000".
 * `ready` once you have it (moving up itself comes with the first business).
 */
export function tierSavings(current: TierId, savings: number): { tier: (typeof TIERS)[number]; have: number; need: number; share: number; ready: boolean } | null {
  const tier = nextTier(current)
  if (!tier) return null
  const have = Math.max(0, Math.floor(savings))
  return { tier, have: Math.min(have, tier.capital), need: tier.capital, share: Math.min(1, have / tier.capital), ready: have >= tier.capital }
}
