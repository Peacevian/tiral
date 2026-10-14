// Hustles: simulated gigs that never need another player. The game server
// generates the jobs from these rules and pays through the ledger.
// See docs/economy-progress.md §16.

import { haversineDistanceMeters, type LatLng } from "./geo.js"

export const HUSTLES = [
  {
    id: "porter",
    name: "Kikuubo porter",
    icon: "🧺",
    blurb: "Carry loads between Kikuubo shops. No bike needed.",
    available: true
  },
  {
    id: "boda",
    name: "Boda passengers",
    icon: "🛵",
    blurb: "Rent a bike and carry passengers from the stage.",
    available: false
  }
] as const

export type HustleId = (typeof HUSTLES)[number]["id"]

export function findHustle(id: string) {
  return HUSTLES.find((hustle) => hustle.id === id) ?? null
}

// ---------------------------------------------------------------------------
// Kikuubo: shops on real streets (shop names are made up).
export type HustleSpot = { id: string; name: string; position: LatLng }

export const KIKUUBO_SPOTS: HustleSpot[] = [
  { id: "kikuubo-lane", name: "Kikuubo Lane wholesalers", position: { lat: 0.31328, lng: 32.57543 } },
  { id: "luwum", name: "Luwum Street hardware", position: { lat: 0.31319, lng: 32.5764 } },
  { id: "ben-kiwanuka", name: "Ben Kiwanuka Street textiles", position: { lat: 0.31283, lng: 32.57607 } },
  { id: "channel", name: "Channel Street mattresses", position: { lat: 0.31202, lng: 32.57561 } },
  { id: "nakivubo-place", name: "Nakivubo Place sugar depot", position: { lat: 0.31229, lng: 32.57471 } },
  { id: "allen", name: "Allen Road bus park", position: { lat: 0.31317, lng: 32.57439 } },
  { id: "william", name: "William Street phone shops", position: { lat: 0.31373, lng: 32.57722 } },
  { id: "burton", name: "Burton Street suppliers", position: { lat: 0.31239, lng: 32.57765 } },
  { id: "market-street", name: "Market Street groceries", position: { lat: 0.3119, lng: 32.57754 } },
  { id: "nakivubo-mews", name: "Nakivubo Mews shoe stalls", position: { lat: 0.31158, lng: 32.5758 } },
  { id: "kiyembe", name: "Kiyembe Lane electronics", position: { lat: 0.31214, lng: 32.57852 } }
]

export function findSpot(id: string) {
  return KIKUUBO_SPOTS.find((spot) => spot.id === id) ?? null
}

export const PORTER_LOADS = [
  { id: "sugar", name: "a 50 kg sack of sugar", heavy: true },
  { id: "bale", name: "a bale of second-hand clothes", heavy: true },
  { id: "oil", name: "two jerrycans of cooking oil", heavy: true },
  { id: "soda", name: "three crates of soda", heavy: true },
  { id: "covers", name: "a box of phone covers", heavy: false },
  { id: "bags", name: "a bundle of school bags", heavy: false },
  { id: "shoes", name: "a sack of shoes", heavy: false }
] as const

// ---------------------------------------------------------------------------
// Porter rules.
export const PORTER_MIN_METERS = 150
export const PORTER_MAX_METERS = 600
/** Offers on the board at once; each waits this long before someone else takes it. */
export const PORTER_OFFER_COUNT = 3
export const PORTER_OFFER_TTL_SECONDS = 60
/** You have this long to reach the pickup after accepting. */
export const PORTER_PICKUP_SECONDS = 90
/** Within this distance of a pin counts as being there. */
export const HUSTLE_ARRIVAL_METERS = 25
/** Sprinting under a load drains energy faster. */
export const PORTER_SPRINT_DRAIN = { light: 1.3, heavy: 1.8 } as const
/** Stress: a paid job eases it a little; an abandoned or late one hurts. */
export const HUSTLE_STRESS = { paid: -1, failed: 3 } as const

/** What a delivery pays (BNG): by straight-line distance, heavier loads more. */
export function porterPay(meters: number, heavy: boolean): number {
  const base = 700 + meters * 3.6
  return Math.round((base * (heavy ? 1.3 : 1)) / 100) * 100
}

/** Energy the job takes on top of any sprinting. */
export function porterEnergyCost(meters: number, heavy: boolean): number {
  return Math.round((3 + meters / 100) * (heavy ? 1.25 : 1) * 10) / 10
}

/** Seconds allowed from pickup to drop-off: generous for winding streets. */
export function porterTimeLimit(meters: number): number {
  return Math.round(20 + meters / 9)
}

export type PorterOffer = {
  id: string
  pickupId: string
  dropoffId: string
  loadId: string
  heavy: boolean
  meters: number
  pay: number
  energy: number
  timeLimitSeconds: number
  expiresAt: number
}

/**
 * A new offer between two shops a sensible distance apart. `random` returns
 * numbers in [0, 1) (Math.random in the server; seeded in tests).
 */
export function makePorterOffer(id: string, now: number, random: () => number, exclude: readonly string[] = []): PorterOffer {
  const spots = KIKUUBO_SPOTS
  for (let attempt = 0; attempt < 50; attempt++) {
    const pickup = spots[Math.floor(random() * spots.length)]!
    const dropoff = spots[Math.floor(random() * spots.length)]!
    if (pickup.id === dropoff.id || exclude.includes(pickup.id)) continue
    const meters = haversineDistanceMeters(pickup.position, dropoff.position)
    if (meters < PORTER_MIN_METERS || meters > PORTER_MAX_METERS) continue
    const load = PORTER_LOADS[Math.floor(random() * PORTER_LOADS.length)]!
    return {
      id,
      pickupId: pickup.id,
      dropoffId: dropoff.id,
      loadId: load.id,
      heavy: load.heavy,
      meters: Math.round(meters),
      pay: porterPay(meters, load.heavy),
      energy: porterEnergyCost(meters, load.heavy),
      timeLimitSeconds: porterTimeLimit(meters),
      expiresAt: now + PORTER_OFFER_TTL_SECONDS * 1000
    }
  }
  // The catalogue always has valid pairs; this is a safe fallback.
  const pickup = spots[0]!
  const dropoff = spots[2]!
  const meters = haversineDistanceMeters(pickup.position, dropoff.position)
  return {
    id,
    pickupId: pickup.id,
    dropoffId: dropoff.id,
    loadId: "covers",
    heavy: false,
    meters: Math.round(meters),
    pay: porterPay(meters, false),
    energy: porterEnergyCost(meters, false),
    timeLimitSeconds: porterTimeLimit(meters),
    expiresAt: now + PORTER_OFFER_TTL_SECONDS * 1000
  }
}
