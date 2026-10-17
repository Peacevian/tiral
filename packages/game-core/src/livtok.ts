// LivTok: selling second-hand clothes (mitumba) on live, the first small
// business (tier 2, docs/economy-progress.md §18 and docs/career-roadmap.md
// Phase 3a). Buy a bale at Owino, open it (the grade mix is the gamble), then
// go live: show a piece, pick a price, answer the comments, and buyers claim
// it. After the live most buyers pay; a few vanish. The game server runs the
// viewers and buyers; these are its rules.

export type LiveGrade = "first" | "second" | "third"
export const LIVE_GRADES: readonly LiveGrade[] = ["first", "second", "third"]
export const GRADE_NAMES: Record<LiveGrade, string> = { first: "First class", second: "Second class", third: "Third class" }

export type BaleId = "tops" | "jeans" | "dresses"

/** Bales at Owino. `fair` is what a piece of each grade sells for at a fair price. */
export const LIVTOK_BALES: ReadonlyArray<{
  id: BaleId
  name: string
  icon: string
  price: number
  pieces: number
  fair: Record<LiveGrade, number>
}> = [
  { id: "tops", name: "Mixed tops", icon: "👕", price: 150_000, pieces: 100, fair: { first: 9_000, second: 5_000, third: 2_500 } },
  { id: "jeans", name: "Jeans", icon: "👖", price: 300_000, pieces: 80, fair: { first: 15_000, second: 8_500, third: 4_000 } },
  { id: "dresses", name: "Premium dresses", icon: "👗", price: 600_000, pieces: 60, fair: { first: 30_000, second: 17_000, third: 8_000 } }
]

export function findBale(id: string) {
  return LIVTOK_BALES.find((bale) => bale.id === id) ?? null
}

/** How long one live lasts. */
export const LIVE_SECONDS = 240
/** Energy a live takes (talking, not carrying sugar). */
export const LIVE_ENERGY = 5
/** A boda takes each paid order to the buyer. */
export const LIVTOK_DELIVERY = 1_000
/** Share of buyers who claim a piece and then never pay. */
export const GHOST_CHANCE = 0.12
/** Followers a TikTok-connected seller starts with on moving up. */
export const STARTING_FOLLOWERS = 50
/** Seconds to answer a comment before it counts as ignored. */
export const ANSWER_SECONDS = 6

export type PriceLevel = "low" | "fair" | "high"
export const PRICE_FACTOR: Record<PriceLevel, number> = { low: 0.75, fair: 1, high: 1.3 }
const BASE_SALE_CHANCE: Record<PriceLevel, number> = { low: 0.95, fair: 0.8, high: 0.5 }

/** What a piece sells for at this price level (rounded to 500). */
export function piecePrice(baleId: string, grade: LiveGrade, level: PriceLevel): number {
  const bale = findBale(baleId) ?? LIVTOK_BALES[0]!
  return Math.round((bale.fair[grade] * PRICE_FACTOR[level]) / 500) * 500
}

/** What a bale cost per piece (for the receipt's profit line). */
export function pieceCost(baleId: string): number {
  const bale = findBale(baleId) ?? LIVTOK_BALES[0]!
  return Math.round(bale.price / bale.pieces)
}

export type GradeCounts = Record<LiveGrade, number>

/**
 * Open a bale: how many pieces of each grade it holds. Usually about 30% first,
 * 50% second and 20% third class; one in six is a bad bale, mostly third.
 * `random` returns numbers in [0, 1).
 */
export function openBale(baleId: string, random: () => number): GradeCounts {
  const bale = findBale(baleId) ?? LIVTOK_BALES[0]!
  const bad = random() < 1 / 6
  const spread = () => (random() - 0.5) * 0.2
  const firstShare = Math.max(0.03, (bad ? 0.1 : 0.3) + spread())
  const thirdShare = Math.max(0.05, (bad ? 0.45 : 0.2) + spread())
  const first = Math.round(bale.pieces * firstShare)
  const third = Math.min(bale.pieces - first, Math.round(bale.pieces * thirdShare))
  return { first, second: bale.pieces - first - third, third }
}

/** Viewers when a live starts, and the most it can draw: both grow with followers. */
export function startViewers(followers: number): number {
  return Math.round(8 + Math.sqrt(Math.max(0, followers)) * 2)
}
export function viewerCeiling(followers: number): number {
  return Math.min(400, Math.round(30 + Math.max(0, followers) * 0.15))
}

export type AnswerQuality = "good" | "wrong" | "ignored"

/** Chance a shown piece gets claimed: price, how you answered, and how many are watching. */
export function saleChance(input: { level: PriceLevel; answer: AnswerQuality; viewers: number; grade: LiveGrade }): number {
  const answer = input.answer === "good" ? 1 : input.answer === "wrong" ? 0.6 : 0.45
  const crowd = Math.min(1, input.viewers / 15)
  // Third-class pieces are a harder sell at anything but a low price.
  const grade = input.grade === "third" && input.level !== "low" ? 0.75 : 1
  return Math.min(0.97, BASE_SALE_CHANCE[input.level] * answer * crowd * grade)
}

/** How the crowd reacts: a sale or a good answer draws people in; ignoring them drives them off. */
export function viewerChange(input: { sold: boolean; answer: AnswerQuality }): number {
  const fromAnswer = input.answer === "good" ? 2 : input.answer === "wrong" ? -2 : -4
  return fromAnswer + (input.sold ? 3 : -1)
}

/** Followers gained (or lost) after a live: sales and a big crowd grow them; buyers who vanish cost a few. */
export function followerChange(input: { sold: number; ghosts: number; peakViewers: number }): number {
  return Math.round(input.sold * 0.6 + input.peakViewers * 0.05 - input.ghosts)
}

/** What the live pays: paid orders, minus a delivery fee each. */
export function liveNet(paidPrices: readonly number[]): number {
  const gross = paidPrices.reduce((sum, price) => sum + price, 0)
  return Math.max(0, gross - paidPrices.length * LIVTOK_DELIVERY)
}

/** Comments that ask something; one reply fits. */
export const LIVE_QUESTIONS: ReadonlyArray<{ text: string; replies: readonly [string, string, string] }> = [
  { text: "Size gani? Will it fit me? 🙏", replies: ["Medium, fits size 38–40", "It's from London!", "Delivery is free"] },
  { text: "How much is it?", replies: ["Price is on screen, comment Mine!", "Ask my manager", "Very cheap, come and see"] },
  { text: "Is it clean, no holes?", replies: ["Clean, no holes, I'll show the back", "It's original", "Hurry, last one"] },
  { text: "Do you deliver to Ntinda?", replies: ["Yes, boda delivers today", "Size is medium", "It's first class"] },
  { text: "Show the label please", replies: ["Here, original label", "Price is fair", "Comment Mine!"] },
  { text: "Can I pay on mobile money?", replies: ["Yes, MoMo or Airtel after the live", "It fits well", "Very clean"] },
  { text: "Turn it around, let me see the back", replies: ["Here's the back, no stains", "It's 100% cotton", "Delivery is 1,000"] },
  { text: "Reduce for me small 😅", replies: ["Last price, it's already fair", "It's from Owino", "Size large"] }
]

export const LIVE_BUYERS = [
  "Nalongo_Fashion",
  "Brenda.K",
  "Mama Shakira",
  "Kato the DJ",
  "Aunty Rose",
  "Joan from Mukono",
  "Sharon 🦋",
  "Ivan.Kla",
  "Nakato B",
  "Patience_256",
  "Mzee's daughter",
  "Daphne Kampala"
] as const
