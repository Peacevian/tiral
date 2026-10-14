// Mini-game hustles (H3): the rolex stand and the car wash. The server issues
// customers and cars and scores timing; clients only send taps.
// See docs/economy-progress.md §16.13.

// ---------------------------------------------------------------------------
// Rolex stand.
export const ROLEX_SPOTS = [
  { id: "kikuubo", name: "Kikuubo Lane", customersPerMinute: 4, raidChance: 0.12 },
  { id: "taxi-park", name: "Old Taxi Park", customersPerMinute: 5, raidChance: 0.18 },
  { id: "nakivubo", name: "Nakivubo", customersPerMinute: 2.5, raidChance: 0.06 }
] as const
export type RolexSpotId = (typeof ROLEX_SPOTS)[number]["id"]

export function findRolexSpot(id: string) {
  return ROLEX_SPOTS.find((spot) => spot.id === id) ?? null
}

/** Ingredient packs you can buy before a shift (eggs, chapati, oil, veg). */
export const ROLEX_PACKS = [
  { id: "small", rolexes: 5, price: 6_000 },
  { id: "large", rolexes: 10, price: 12_000 }
] as const

export function findRolexPack(id: string) {
  return ROLEX_PACKS.find((pack) => pack.id === id) ?? null
}

export const ROLEX_PRICE = 2_000
export const ROLEX_PERFECT_TIP = 500
export const ROLEX_SHIFTS_PER_DAY = 2
export const ROLEX_ENERGY_PER_ROLEX = 1.5
/** Customers wait this long before walking off. */
export const ROLEX_PATIENCE_SECONDS = 35
/** The egg is ready to flip from `start` to `end` seconds after cooking starts. */
export const ROLEX_FLIP_WINDOW = { start: 3, end: 4.5 } as const
/** "Perfect" is within this many seconds of the window's middle. */
export const ROLEX_PERFECT_MARGIN = 0.35
/** Network slack added to both edges of the flip window. */
export const ROLEX_FLIP_SLACK = 0.15
export const ROLEX_RAID_RUN_SECONDS = 3
export const KCCA_FINE = 20_000
export const STALL_STRESS = { goodShift: -2, raided: 10 } as const

export type FlipResult = "perfect" | "good" | "raw" | "burnt"

/** Score a flip that came `seconds` after the egg went on. */
export function scoreFlip(seconds: number): FlipResult {
  const { start, end } = ROLEX_FLIP_WINDOW
  if (seconds < start - ROLEX_FLIP_SLACK) return "raw"
  if (seconds > end + ROLEX_FLIP_SLACK) return "burnt"
  const middle = (start + end) / 2
  return Math.abs(seconds - middle) <= ROLEX_PERFECT_MARGIN ? "perfect" : "good"
}

/** What one rolex earns for a flip result (burnt sells nothing; you cook again). */
export function rolexSale(result: FlipResult): number {
  if (result === "burnt") return 0
  if (result === "raw") return ROLEX_PRICE / 2
  return ROLEX_PRICE + (result === "perfect" ? ROLEX_PERFECT_TIP : 0)
}

// ---------------------------------------------------------------------------
// Car wash: a 3D washing bay. The car's surface is split into zones (bonnet,
// roof, each door…). Each zone needs soap, then scrubbing, then rinsing; the
// client sends one action per zone at a time and the server applies the rules.
export const CAR_TYPES = [
  { id: "saloon", name: "Saloon car", pay: 8_000, zones: 12, seconds: 180, weight: 5 },
  { id: "suv", name: "SUV", pay: 12_000, zones: 16, seconds: 240, weight: 3 },
  { id: "taxi", name: "Taxi (matatu)", pay: 15_000, zones: 20, seconds: 300, weight: 2 }
] as const
export type CarTypeId = (typeof CAR_TYPES)[number]["id"]

export function findCarType(id: string) {
  return CAR_TYPES.find((car) => car.id === id) ?? null
}

export type WashTool = "soap" | "scrub" | "rinse"
export const WASH_TOOLS: readonly WashTool[] = ["soap", "scrub", "rinse"]

/** One zone of the car: soap 0–1 (foam on it), dirt 1–0, clean once rinsed. */
export type WashZone = { soap: number; dirt: number; clean: boolean }

export const FRESH_ZONE: WashZone = { soap: 0, dirt: 1, clean: false }

/** Actions on the same zone with the same tool closer together than this don't count. */
export const WASH_MIN_ACTION_MS = 80
/** Mud one scrub action takes off soapy paint (about half a second of scrubbing a panel), and off dry paint. */
export const WASH_SCRUB = 0.2
export const WASH_DRY_SCRUB = 0.04
/** Rinsing finishes a zone once its dirt is down to this. */
export const WASH_RINSE_DIRT = 0.15

/**
 * One soap, scrub or rinse action on a zone. Scrubbing only really works on
 * soapy paint; rinsing a zone that's still dirty just washes the soap away.
 */
export function applyWash(zone: WashZone, tool: WashTool): WashZone {
  if (zone.clean) return zone
  if (tool === "soap") return { ...zone, soap: Math.min(1, zone.soap + 0.25) }
  if (tool === "scrub") {
    const soapy = zone.soap >= 0.25
    return {
      ...zone,
      dirt: Math.max(0, zone.dirt - (soapy ? WASH_SCRUB : WASH_DRY_SCRUB)),
      soap: soapy ? Math.max(0.25, zone.soap - 0.02) : zone.soap
    }
  }
  const soap = Math.max(0, zone.soap - 0.35)
  return { ...zone, soap, clean: soap === 0 && zone.dirt <= WASH_RINSE_DIRT }
}

export const CAR_SOAP = 500
export const CAR_WASH_DAILY_LIMIT = 4
export const CAR_WASH_ENERGY = 12
/** Below this share of zones clean, the driver won't pay. */
export const CAR_MIN_CLEAN_SHARE = 0.7
export const CAR_QUICK_TIP_SHARE = 0.1

/** Weighted pick of the next car; `roll` in [0, 1). */
export function pickCar(roll: number) {
  const total = CAR_TYPES.reduce<number>((sum, car) => sum + car.weight, 0)
  let at = Math.min(0.999999, Math.max(0, roll)) * total
  for (const car of CAR_TYPES) {
    at -= car.weight
    if (at < 0) return car
  }
  return CAR_TYPES[0]
}

export type CarPayout = { pay: number; tip: number; soap: number; net: number; cleanShare: number }

/**
 * What a car pays: full if every zone is clean (tip if done in the first half
 * of the time), by share if at least 70% clean, otherwise nothing. Soap comes
 * off whatever was earned.
 */
export function carPayout(input: { carId: string; cleanZones: number; secondsUsed: number }): CarPayout {
  const car = findCarType(input.carId) ?? CAR_TYPES[0]
  const cleanShare = Math.max(0, Math.min(1, input.cleanZones / car.zones))
  let pay = 0
  if (cleanShare >= 1) pay = car.pay
  else if (cleanShare >= CAR_MIN_CLEAN_SHARE) pay = Math.round((car.pay * cleanShare) / 100) * 100
  const quick = cleanShare >= 1 && input.secondsUsed <= car.seconds / 2
  const tip = quick ? Math.round((car.pay * CAR_QUICK_TIP_SHARE) / 100) * 100 : 0
  const soap = CAR_SOAP
  return { pay, tip, soap, net: Math.max(0, pay + tip - soap), cleanShare }
}
