// Kampala Hustle, phase 3: rent, stress, family requests & shocks.
// Pure rules; @tiral/db applies them lazily whenever the player shows up.
// See docs/economy-progress.md §13–14.

import { TIERS, type TierId } from "./tiers.js"

// ---------------------------------------------------------------------------
// Time: one "game week" is two real days, so rent pressure is felt while the
// game is still fresh in a player's mind.
export const RENT_PERIOD_HOURS = 48
export const HOUR_MS = 3_600_000

// ---------------------------------------------------------------------------
// Housing: your tier is where you live and what rent you owe each game week.
export const HOUSING_TIERS = [
  { id: "kisenyi", name: "Single room, Kisenyi", rent: 35_000 },
  { id: "kawempe", name: "Room & shared bathroom, Kawempe", rent: 60_000 },
  { id: "ntinda", name: "Self-contained, Ntinda", rent: 120_000 },
  { id: "kololo", name: "Flat, Kololo", rent: 300_000 },
  // The big homes: rent that means something to a business owner (§18).
  { id: "muyenga", name: "House with a garden, Muyenga", rent: 1_500_000 },
  { id: "naguru", name: "Villa with a pool, Naguru", rent: 8_000_000 },
  { id: "munyonyo", name: "Lakeside mansion, Munyonyo", rent: 30_000_000 }
] as const
export type HousingTierId = (typeof HOUSING_TIERS)[number]["id"]

/** Homes only some careers can rent (the landlord wants to see the business). */
export const HOME_CAREER: Partial<Record<HousingTierId, TierId>> = { muyenga: "town", naguru: "big", munyonyo: "tycoon" }

/** Can someone at this career tier rent this home? */
export function homeOpenTo(home: string, career: TierId): boolean {
  const needed = HOME_CAREER[home as HousingTierId]
  if (!needed) return true
  return TIERS.findIndex((tier) => tier.id === career) >= TIERS.findIndex((tier) => tier.id === needed)
}
export const STARTING_TIER: HousingTierId = "kisenyi"

export function findTier(id: string) {
  return HOUSING_TIERS.find((tier) => tier.id === id) ?? HOUSING_TIERS[0]
}

function tierIndex(id: string) {
  return Math.max(0, HOUSING_TIERS.findIndex((tier) => tier.id === id))
}

// ---------------------------------------------------------------------------
// Stress (0–100): the frustration stat. Eases off slowly on its own.
export const STRESS_MAX = 100
export const STRESS_START = 20
export const STRESS_DECAY_PER_HOUR = 2
/** At or above this, energy refills slower (you can't rest your mind). */
export const STRESSED_THRESHOLD = 70
export const STRESSED_ENERGY_REGEN_FACTOR = 0.6

export const STRESS = {
  rentPaid: -5,
  rentMissed: 25,
  requestPaid: -4,
  shockUncovered: 15,
  raceWin: -10,
  collapse: 8
} as const

const clampStress = (value: number) => Math.min(STRESS_MAX, Math.max(0, value))

export function currentStress(stored: number, at: Date, now: Date): number {
  const hours = Math.max(0, now.getTime() - at.getTime()) / HOUR_MS
  return clampStress(stored - hours * STRESS_DECAY_PER_HOUR)
}

export function addStress(value: number, delta: number): number {
  return clampStress(value + delta)
}

// ---------------------------------------------------------------------------
// Rent: settled lazily for every period that has come due.
export type RentNotice =
  | { kind: "rent_paid"; tier: HousingTierId; amount: number; dueAt: Date }
  | { kind: "evicted"; from: HousingTierId; to: HousingTierId; dueAt: Date }
  | { kind: "rent_grace"; tier: HousingTierId; amount: number; dueAt: Date }

export type RentSettlement = {
  tier: HousingTierId
  rentDueAt: Date
  charged: number
  stressDelta: number
  notices: RentNotice[]
}

/** At most this many overdue periods are settled in one go (long absences). */
const MAX_PERIODS_PER_SETTLE = 8

/**
 * Walk every rent period that has come due. Pay if you can; if not, move down
 * a tier (never homeless). At the cheapest tier the landlord lets it slide —
 * at a stress cost.
 */
export function settleRent(input: { tier: string; rentDueAt: Date; balance: number }, now: Date): RentSettlement {
  let tier = findTier(input.tier).id as HousingTierId
  let due = new Date(input.rentDueAt)
  let balance = input.balance
  let charged = 0
  let stressDelta = 0
  const notices: RentNotice[] = []

  for (let i = 0; i < MAX_PERIODS_PER_SETTLE && due.getTime() <= now.getTime(); i++) {
    const rent = findTier(tier).rent
    if (balance >= rent) {
      balance -= rent
      charged += rent
      stressDelta += STRESS.rentPaid
      notices.push({ kind: "rent_paid", tier, amount: rent, dueAt: due })
    } else if (tierIndex(tier) > 0) {
      const to = HOUSING_TIERS[tierIndex(tier) - 1]!.id as HousingTierId
      stressDelta += STRESS.rentMissed
      notices.push({ kind: "evicted", from: tier, to, dueAt: due })
      tier = to
    } else {
      stressDelta += STRESS.rentMissed
      notices.push({ kind: "rent_grace", tier, amount: rent, dueAt: due })
    }
    due = new Date(due.getTime() + RENT_PERIOD_HOURS * HOUR_MS)
  }
  // Far behind (long absence): skip ahead without stacking more penalties.
  while (due.getTime() <= now.getTime()) due = new Date(due.getTime() + RENT_PERIOD_HOURS * HOUR_MS)

  return { tier, rentDueAt: due, charged, stressDelta, notices }
}

// ---------------------------------------------------------------------------
// Family requests (you choose) and shocks (they just happen).
export const EVENT_INTERVAL_HOURS = 8
export const MAX_PENDING_REQUESTS = 2
export const REQUEST_EXPIRY_HOURS = 24

export const LIFE_EVENTS = [
  {
    id: "maama_hospital",
    type: "request",
    from: "Maama",
    text: "I'm at the hospital. Please send 50,000 for the medicine 🙏",
    amount: 50_000,
    refuseStress: 14,
    weight: 3
  },
  {
    id: "sister_fees",
    type: "request",
    from: "Sister",
    text: "School is sending me home. Fees balance is 80,000.",
    amount: 80_000,
    refuseStress: 12,
    weight: 2
  },
  {
    id: "friend_transport",
    type: "request",
    from: "Kato",
    text: "Bro, I'm stuck in Entebbe. Send 15,000 for transport, I'll pay back.",
    amount: 15_000,
    refuseStress: 5,
    weight: 3
  },
  {
    id: "burial_contribution",
    type: "request",
    from: "Village group",
    text: "Contribution for Jajja's burial: 30,000 each.",
    amount: 30_000,
    refuseStress: 10,
    weight: 2
  },
  {
    id: "phone_snatched",
    type: "shock",
    from: "Kikuubo",
    text: "Your phone was snatched in Kikuubo. A cheap replacement cost you 30,000.",
    amount: 30_000,
    refuseStress: 0,
    weight: 1
  },
  {
    id: "kcca_fine",
    type: "shock",
    from: "KCCA",
    text: "KCCA fined you for hawking without a permit: 20,000.",
    amount: 20_000,
    refuseStress: 0,
    weight: 1
  }
] as const

export type LifeEventId = (typeof LIFE_EVENTS)[number]["id"]

export function findLifeEvent(id: string) {
  return LIFE_EVENTS.find((event) => event.id === id) ?? null
}

/** Weighted pick; `roll` is a number in [0, 1). */
export function pickLifeEvent(roll: number, exclude: readonly string[] = []) {
  const pool = LIFE_EVENTS.filter((event) => !exclude.includes(event.id))
  const choices: readonly (typeof LIFE_EVENTS)[number][] = pool.length > 0 ? pool : LIFE_EVENTS
  const total = choices.reduce<number>((sum, event) => sum + event.weight, 0)
  let at = Math.min(0.999999, Math.max(0, roll)) * total
  for (const event of choices) {
    at -= event.weight
    if (at < 0) return event
  }
  return choices[choices.length - 1]!
}

/** How many new events are owed since the last one (capped by pending requests). */
export function eventsDue(lastEventAt: Date | null, now: Date, pendingRequests: number): number {
  const room = Math.max(0, MAX_PENDING_REQUESTS - pendingRequests)
  if (room === 0) return 0
  // A brand-new player gets a grace period: the clock starts on their first
  // visit and the first event arrives an interval later, never on arrival.
  if (!lastEventAt) return 0
  const intervals = Math.floor((now.getTime() - lastEventAt.getTime()) / (EVENT_INTERVAL_HOURS * HOUR_MS))
  return Math.min(room, Math.max(0, intervals))
}
