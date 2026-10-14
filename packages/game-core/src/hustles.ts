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
    blurb: "Rent a bike for the day and carry passengers from the stage.",
    available: true
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
/**
 * Paid porter jobs per Kampala day. Energy alone can't limit it: street food
 * is cheap enough (a rolex funds ~5 jobs) that eating would make it endless.
 */
export const PORTER_DAILY_JOBS = 20
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
  kind: "porter"
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
      kind: "porter",
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
    kind: "porter",
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

// ---------------------------------------------------------------------------
// Boda passengers: wait at a stage, carry people across town. Pins sit on the
// nearest road point so arrivals (within 25 m of the server's runner) are reachable.
export const BODA_STAGES: HustleSpot[] = [
  { id: "stage-old-taxi-park", name: "Old Taxi Park stage", position: { lat: 0.3131, lng: 32.5739 } },
  { id: "stage-city-square", name: "City Square stage", position: { lat: 0.31334, lng: 32.58079 } },
  { id: "stage-nakasero", name: "Nakasero Market stage", position: { lat: 0.3186, lng: 32.5766 } },
  { id: "stage-jinja-road", name: "Jinja Road stage", position: { lat: 0.31177, lng: 32.58518 } }
]

/** Where passengers want to go (inside the play area). */
export const BODA_DESTINATIONS: HustleSpot[] = [
  { id: "dest-parliament", name: "Parliament", position: { lat: 0.3208, lng: 32.58754 } },
  { id: "dest-sheraton", name: "Sheraton Hill", position: { lat: 0.3184, lng: 32.5863 } },
  { id: "dest-nakivubo", name: "Nakivubo", position: { lat: 0.3098, lng: 32.5794 } },
  { id: "dest-nasser-road", name: "Nasser Road printers", position: { lat: 0.31772, lng: 32.57932 } },
  { id: "dest-nakasero-hill", name: "Nakasero hill", position: { lat: 0.32022, lng: 32.58425 } },
  { id: "dest-kampala-road", name: "Kampala Road banks", position: { lat: 0.31329, lng: 32.58104 } },
  { id: "dest-kikuubo", name: "Kikuubo Lane", position: { lat: 0.31328, lng: 32.57543 } },
  { id: "dest-luwum", name: "Luwum Street", position: { lat: 0.31319, lng: 32.5764 } },
  { id: "dest-william", name: "William Street", position: { lat: 0.31373, lng: 32.57722 } },
  { id: "dest-market-street", name: "Market Street", position: { lat: 0.3119, lng: 32.57754 } }
]

const ALL_PLACES = [...KIKUUBO_SPOTS, ...BODA_STAGES, ...BODA_DESTINATIONS]

/** Any hustle pin by id (shops, stages, destinations). */
export function findPlace(id: string) {
  return ALL_PLACES.find((place) => place.id === id) ?? null
}

export const BODA_BIKE_RENT = 10_000
/** Bike vs walking speed (sprint "revs" on top, and uses less energy than running). */
export const BODA_SPEED_FACTOR = 2
export const BODA_SPRINT_DRAIN = 0.5
export const BODA_MIN_METERS = 500
export const BODA_MAX_METERS = 2_200
export const BODA_OFFER_COUNT = 3
export const BODA_OFFER_TTL_SECONDS = 75
/** Seconds to reach the stage after accepting. */
export const BODA_PICKUP_SECONDS = 120
export const BODA_DAILY_TRIPS = 15
/** BNG of fuel per metre ridden (petrol ≈ 6,500/L at ~11 km/L). */
export const BODA_FUEL_PER_METER = 0.6
export const BODA_TIP_MAX = 0.2

/** Kampala is UTC+3 all year. */
export function kampalaHour(at: Date): number {
  return (at.getUTCHours() + 3) % 24
}

/** Morning and evening rush: fares ×1.5. */
export function isRushHour(at: Date): boolean {
  const hour = kampalaHour(at)
  return (hour >= 7 && hour < 9) || (hour >= 17 && hour < 20)
}

export function bodaFare(meters: number, rush: boolean): number {
  const base = 1_500 + meters * 1.8
  return Math.round((base * (rush ? 1.5 : 1)) / 100) * 100
}

export function bodaFuelCost(metersRidden: number, perMeter = BODA_FUEL_PER_METER): number {
  return Math.round(metersRidden * perMeter)
}

/** Seconds a quick rider needs (straight line at bike speed, plus a margin for streets). */
export function bodaExpectedSeconds(meters: number): number {
  return Math.round(meters / (18 * BODA_SPEED_FACTOR) * 1.6 + 10)
}

/** Full fare up to this; half fare after; the passenger gets off at `bodaGiveUpSeconds`. */
/** `patience` > 1 on comfier bikes (passengers wait longer). */
export function bodaFullFareSeconds(meters: number, patience = 1): number {
  return Math.round((bodaExpectedSeconds(meters) * 1.8 + 10) * patience)
}

export function bodaGiveUpSeconds(meters: number, patience = 1): number {
  return Math.round((bodaExpectedSeconds(meters) * 3 + 20) * patience)
}

/** Tip share for a ride that took `seconds`: up to 20% when quick, nothing when slow. */
export function bodaTipShare(meters: number, seconds: number, tipFactor = 1): number {
  const expected = bodaExpectedSeconds(meters)
  const ratio = seconds / expected
  const max = BODA_TIP_MAX * tipFactor
  if (ratio <= 1) return Math.round(max * 100) / 100
  if (ratio >= 2) return 0
  return Math.round(max * (2 - ratio) * 100) / 100
}

export function bodaEnergyCost(meters: number): number {
  return Math.round((1.5 + meters / 1000) * 10) / 10
}

export type BodaPayout = { fare: number; tip: number; fuel: number; late: boolean; net: number }

/**
 * What a finished ride pays. Fuel since the last payout comes off the fare;
 * if the fare can't cover it, the shortfall is simply absorbed (agreed for now).
 */
export function bodaPayout(input: {
  fare: number
  meters: number
  seconds: number
  fuelMeters: number
  /** From the bike's stats (defaults: the stage rental). */
  fuelPerMeter?: number
  patience?: number
  tipFactor?: number
}): BodaPayout {
  const late = input.seconds > bodaFullFareSeconds(input.meters, input.patience)
  const fare = late ? Math.round(input.fare / 2 / 100) * 100 : input.fare
  const tip = late ? 0 : Math.round((fare * bodaTipShare(input.meters, input.seconds, input.tipFactor)) / 100) * 100
  const fuel = bodaFuelCost(input.fuelMeters, input.fuelPerMeter)
  return { fare, tip, fuel, late, net: Math.max(0, fare + tip - fuel) }
}

export const PASSENGER_NAMES = [
  "Auntie Florence",
  "a student from Makerere",
  "Mzee Okello",
  "a market vendor",
  "a man in a suit",
  "Nalongo with shopping",
  "a nurse on shift",
  "a tourist with a backpack"
] as const

export type BodaOffer = {
  id: string
  kind: "boda"
  pickupId: string
  dropoffId: string
  passenger: string
  meters: number
  fare: number
  rush: boolean
  energy: number
  expiresAt: number
}

export function makeBodaOffer(id: string, now: number, random: () => number, exclude: readonly string[] = []): BodaOffer {
  const rush = isRushHour(new Date(now))
  for (let attempt = 0; attempt < 60; attempt++) {
    const stage = BODA_STAGES[Math.floor(random() * BODA_STAGES.length)]!
    const dest = BODA_DESTINATIONS[Math.floor(random() * BODA_DESTINATIONS.length)]!
    if (exclude.includes(`${stage.id}>${dest.id}`)) continue
    const meters = haversineDistanceMeters(stage.position, dest.position)
    if (meters < BODA_MIN_METERS || meters > BODA_MAX_METERS) continue
    return {
      id,
      kind: "boda",
      pickupId: stage.id,
      dropoffId: dest.id,
      passenger: PASSENGER_NAMES[Math.floor(random() * PASSENGER_NAMES.length)]!,
      meters: Math.round(meters),
      fare: bodaFare(meters, rush),
      rush,
      energy: bodaEnergyCost(meters),
      expiresAt: now + BODA_OFFER_TTL_SECONDS * 1000
    }
  }
  const stage = BODA_STAGES[0]!
  const dest = BODA_DESTINATIONS[5]!
  const meters = haversineDistanceMeters(stage.position, dest.position)
  return {
    id,
    kind: "boda",
    pickupId: stage.id,
    dropoffId: dest.id,
    passenger: PASSENGER_NAMES[0],
    meters: Math.round(meters),
    fare: bodaFare(meters, rush),
    rush,
    energy: bodaEnergyCost(meters),
    expiresAt: now + BODA_OFFER_TTL_SECONDS * 1000
  }
}

export type HustleOffer = PorterOffer | BodaOffer
