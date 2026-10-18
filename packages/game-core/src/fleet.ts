// Boda fleet: the first town business (tier 3, docs/career-roadmap.md Phase
// 4a). You own bikes, each with a rider. In a fleet shift you send riders out
// on runs; a bike on the road pays you dues while it's out, and every run
// wears it. Things happen (crashes, the police, advances, theft) and each asks
// for a quick choice. The game server runs the shift; these are its rules.

import { findBikeModel } from "./bikes.js"

/** Bikes you can run in a fleet, with what a bike on the road pays you a minute. */
export const FLEET_MODELS: ReadonlyArray<{ id: "boxa100" | "star125" | "zemboE"; duesPerMinute: number; wearPerRun: number; blurb: string }> = [
  { id: "boxa100", duesPerMinute: 25_000, wearPerRun: 5, blurb: "The everyday boda: cheap, earns steadily" },
  { id: "star125", duesPerMinute: 30_000, wearPerRun: 4, blurb: "Faster, more trips, tougher" },
  { id: "zemboE", duesPerMinute: 36_000, wearPerRun: 3, blurb: "Electric: earns most, fuel prices don't touch it" }
]
export type FleetModelId = (typeof FLEET_MODELS)[number]["id"]

export function findFleetModel(id: string) {
  return FLEET_MODELS.find((model) => model.id === id) ?? null
}

/** What a fleet bike costs (the garage price). */
export function fleetBikePrice(model: FleetModelId): number {
  return findBikeModel(model)?.price ?? 450_000
}

/** Moving up to Town business: LivTok lives done, and the first fleet you get. */
export const TOWN_LIVES_NEEDED = 10
export const STARTER_FLEET: { model: FleetModelId; count: number } = { model: "boxa100", count: 4 }
export const FLEET_MAX_BIKES = 20

/** One fleet shift. */
export const FLEET_SHIFT_SECONDS = 300
/** Energy a shift takes (phone calls and shouting, not riding). */
export const FLEET_ENERGY = 5
/** A run lasts this long, then the rider is back and waits to be sent out again. */
export const RUN_SECONDS: readonly [number, number] = [40, 70]
/** A bike parked after a crash or breakdown is back after this long. */
export const GARAGE_SECONDS = 60
/** Something happens every so often. */
export const EVENT_GAP_SECONDS: readonly [number, number] = [35, 60]
/** Seconds to choose before the default (the free option) is taken. */
export const EVENT_CHOICE_SECONDS = 12

export const TRACKER_PRICE = 60_000

/** Servicing a bike back to new: more the more worn it is. */
export function fleetServiceCost(wear: number): number {
  return Math.round((Math.max(0, Math.min(100, wear)) * 1_500) / 1_000) * 1_000
}

/** A worn bike earns less: full dues up to 40 wear, down to 60% at 100. */
export function wearFactor(wear: number): number {
  const w = Math.max(0, Math.min(100, wear))
  return w <= 40 ? 1 : 1 - ((w - 40) / 60) * 0.4
}

/** Chance a run ends in a breakdown: rare on a fresh bike, likely on a wreck. */
export function breakdownChance(wear: number): number {
  const w = Math.max(0, Math.min(100, wear))
  return Math.min(0.5, 0.01 + (w / 100) ** 2 * 0.4)
}

/** What one run pays: dues for the time out, scaled by the rider, the bike's state and the fuel price. */
export function runDues(input: { model: FleetModelId; seconds: number; skill: number; wear: number; fuelSpike: boolean }): number {
  const model = findFleetModel(input.model) ?? FLEET_MODELS[0]!
  const fuel = input.fuelSpike && model.id !== "zemboE" ? 0.8 : 1
  const dues = (model.duesPerMinute / 60) * input.seconds * input.skill * wearFactor(input.wear) * fuel
  return Math.max(0, Math.round(dues / 100) * 100)
}

/** A new rider: a name and how good they are (0.85–1.15 of the usual dues). */
export function hireRider(random: () => number, taken: readonly string[] = []): { rider: string; skill: number } {
  const free = RIDER_NAMES.filter((name) => !taken.includes(name))
  const pool = free.length > 0 ? free : RIDER_NAMES
  const rider = pool[Math.floor(random() * pool.length)]!
  return { rider, skill: Math.round((0.85 + random() * 0.3) * 100) / 100 }
}

export const RIDER_NAMES = [
  "Musa", "Kato", "Ssali", "Okello", "Wasswa", "Mukasa", "Ojok", "Byaruhanga", "Tumusiime", "Kizza",
  "Opio", "Lubega", "Sserwadda", "Mugisha", "Odongo", "Nsubuga", "Kaggwa", "Atwine", "Lule", "Ochieng"
] as const

export const FLEET_PLACES = ["Wandegeya", "Kubbiri", "Nakawa", "Kireka", "Bwaise", "Ntinda", "Nateete", "Kansanga", "Kawempe", "Mengo", "Kisenyi", "Old Kampala"] as const

/**
 * What can happen in a shift. Each asks one quick choice; `pay` options cost
 * coins now, the free option has a consequence instead. Weights are relative.
 */
export type FleetEventKind = "crash" | "police" | "advance" | "theft" | "fuel" | "hire"
export const FLEET_EVENTS: Record<FleetEventKind, { weight: number; cost: number; title: string }> = {
  // Pay for the repair now, or park the bike for GARAGE_SECONDS.
  crash: { weight: 4, cost: 50_000, title: "Crash" },
  // Pay the fine, or the bike is impounded for the rest of the shift.
  police: { weight: 3, cost: 30_000, title: "Police checkpoint" },
  // Lend it (most riders pay back with a thank-you at the end), or refuse and the rider sulks.
  advance: { weight: 2, cost: 30_000, title: "Advance" },
  // Report it (police fee): a tracker usually gets it back, otherwise it's a coin toss. Ignore it and it's gone.
  theft: { weight: 1, cost: 10_000, title: "Stolen!" },
  // Nothing to choose: dues drop for a while (electric bikes don't care).
  fuel: { weight: 2, cost: 0, title: "Fuel price up" },
  // A wedding convoy wants a bike: send one for a bonus, it's off the road a while.
  hire: { weight: 2, cost: 0, title: "Special hire" }
}

export const FUEL_SPIKE_SECONDS = 90
export const SULK_SECONDS = 120
export const SULK_FACTOR = 0.8
export const ADVANCE_REPAY_CHANCE = 0.75
export const ADVANCE_THANKS = 5_000
export const HIRE_BONUS = 120_000
export const HIRE_SECONDS = 45
/** Chance a reported theft is recovered, with and without a tracker. */
export function recoveryChance(tracker: boolean): number {
  return tracker ? 0.9 : 0.4
}

/** Pick the next event (theft only when a bike is on the road, etc. is the caller's job). */
export function pickFleetEvent(random: () => number, allowed: readonly FleetEventKind[]): FleetEventKind | null {
  if (allowed.length === 0) return null
  const total = allowed.reduce((sum, kind) => sum + FLEET_EVENTS[kind].weight, 0)
  let roll = random() * total
  for (const kind of allowed) {
    roll -= FLEET_EVENTS[kind].weight
    if (roll < 0) return kind
  }
  return allowed[allowed.length - 1]!
}

/** What a fleet bike adds to net worth: its price, less wear (down to half at 100). */
export function fleetBikeValue(model: FleetModelId, wear: number): number {
  return Math.round(fleetBikePrice(model) * (1 - Math.max(0, Math.min(100, wear)) / 200))
}
