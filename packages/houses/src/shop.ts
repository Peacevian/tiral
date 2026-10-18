// Furniture costs money (docs/career-roadmap.md, house inventory): every piece
// is bought at one of three markets, kept until sold (back for half), and
// moves house with you. Painting, new floors and moving cost a fee. A good bed
// and a sofa or TV at home help your body and your stress.

import { FURNITURE, type FurnitureGrade, type FurnitureId, type HouseLoadout, type PlacedItem } from "./catalog.js"

export const GRADE_INFO: Record<FurnitureGrade, { market: string; label: string; blurb: string }> = {
  owino: { market: "Owino", label: "Basic", blurb: "Second hand and plastic: cheap, does the job" },
  kikuubo: { market: "Kikuubo", label: "Good", blurb: "Solid wood and new fabric" },
  acacia: { market: "Acacia Mall", label: "Luxury", blurb: "Imported, leather and gold: to show off" }
}

/** Price of each piece at each market. */
export const FURNITURE_PRICES: Record<FurnitureId, Record<FurnitureGrade, number>> = {
  bed: { owino: 120_000, kikuubo: 450_000, acacia: 4_000_000 },
  table: { owino: 40_000, kikuubo: 150_000, acacia: 1_500_000 },
  chair: { owino: 15_000, kikuubo: 60_000, acacia: 600_000 },
  sofa: { owino: 250_000, kikuubo: 900_000, acacia: 8_000_000 },
  rug: { owino: 30_000, kikuubo: 120_000, acacia: 1_200_000 },
  plant: { owino: 10_000, kikuubo: 40_000, acacia: 400_000 },
  shelf: { owino: 50_000, kikuubo: 200_000, acacia: 2_000_000 },
  lamp: { owino: 25_000, kikuubo: 100_000, acacia: 1_000_000 },
  television: { owino: 350_000, kikuubo: 1_200_000, acacia: 6_000_000 },
  stove: { owino: 80_000, kikuubo: 300_000, acacia: 3_000_000 },
  fridge: { owino: 900_000, kikuubo: 2_500_000, acacia: 12_000_000 }
}

export function furniturePrice(item: FurnitureId, grade: FurnitureGrade): number {
  return FURNITURE_PRICES[item][grade]
}

/** Selling a piece back gets half of what you paid. */
export const SELL_BACK_SHARE = 0.5
export function sellBackPrice(paid: number): number {
  return Math.floor((Math.max(0, paid) * SELL_BACK_SHARE) / 1_000) * 1_000
}

/** A painter (walls, trim or roof colour or material) and a fundi for a new floor. */
export const PAINT_FEE = 20_000
export const FLOOR_FEE = 150_000

/** What a saved change to the house costs. */
export function houseChangeFee(before: HouseLoadout | null, after: HouseLoadout): { paint: number; floor: number } {
  if (!before) return { paint: 0, floor: 0 }
  const painted =
    before.wallMaterial !== after.wallMaterial ||
    before.roofMaterial !== after.roofMaterial ||
    before.colors.wall !== after.colors.wall ||
    before.colors.roof !== after.colors.roof ||
    before.colors.trim !== after.colors.trim
  const floored = before.floorMaterial !== after.floorMaterial || before.colors.floor !== after.colors.floor
  return { paint: painted ? PAINT_FEE : 0, floor: floored ? FLOOR_FEE : 0 }
}

/** Moving house: a boda for a few things, a pickup for a room's worth, a lorry for a full house. */
export function movingFee(pieces: number): { fee: number; by: string } {
  if (pieces <= 0) return { fee: 0, by: "on foot" }
  if (pieces <= 3) return { fee: 15_000, by: "a boda" }
  if (pieces <= 10) return { fee: 60_000, by: "a pickup" }
  return { fee: 180_000, by: "a lorry" }
}

/** How fast resting at home refills energy: on the floor without a bed, faster in a better bed. */
export const REST_FACTOR: Record<FurnitureGrade | "none", number> = { none: 0.7, owino: 1, kikuubo: 1.15, acacia: 1.3 }

/** How much faster stress fades at home for each sofa and TV, by grade. */
const CALM: Partial<Record<FurnitureId, Record<FurnitureGrade, number>>> = {
  sofa: { owino: 0.1, kikuubo: 0.2, acacia: 0.35 },
  television: { owino: 0.15, kikuubo: 0.3, acacia: 0.5 }
}

const GRADE_RANK: Record<FurnitureGrade, number> = { owino: 0, kikuubo: 1, acacia: 2 }

/**
 * What the furniture in your room does for you: the best bed sets the rest
 * factor; the best sofa and best TV each speed up how stress fades.
 */
export function homeComfort(items: readonly PlacedItem[]): { restFactor: number; calmFactor: number } {
  let bed: FurnitureGrade | "none" = "none"
  const best: Partial<Record<FurnitureId, FurnitureGrade>> = {}
  for (const item of items) {
    const grade = item.grade ?? "owino"
    const held = best[item.item]
    if (!held || GRADE_RANK[grade] > GRADE_RANK[held]) best[item.item] = grade
  }
  if (best.bed) bed = best.bed
  let calm = 1
  for (const [item, grades] of Object.entries(CALM)) {
    const grade = best[item as FurnitureId]
    if (grade && grades) calm += grades[grade]
  }
  return { restFactor: REST_FACTOR[bed], calmFactor: Math.round(calm * 100) / 100 }
}

/** The shop list: every piece at every market. */
export const SHOP = FURNITURE.flatMap((spec) => (["owino", "kikuubo", "acacia"] as const).map((grade) => ({ item: spec.id, grade, price: FURNITURE_PRICES[spec.id][grade] })))
