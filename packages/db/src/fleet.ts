import { and, count, eq, sql } from "drizzle-orm"
import {
  FLEET_MAX_BIKES,
  FLEET_MODELS,
  STARTER_FLEET,
  TOWN_LIVES_NEEDED,
  TRACKER_PRICE,
  findFleetModel,
  findTierById,
  fleetBikePrice,
  fleetServiceCost,
  type FleetModelId
} from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, findNote, insertEntry, lockUser, type Tx } from "./ledger.js"
import { getTier } from "./livtok.js"
import { coinLedger, fleetBikes, lifeEvents } from "./schema.js"

// Boda fleet, the first town business (docs/career-roadmap.md Phase 4a).
// Bikes and riders have rows; every coin goes through the ledger:
// tier_up "town" (the first fleet), fleet_bike_buy, fleet_service,
// fleet_tracker, fleet_cost (repairs, fines, advances paid in a shift) and
// fleet_dues (one payment per shift).

export type FleetBike = { id: string; model: FleetModelId; rider: string; skill: number; wear: number; tracker: boolean }

/** Your fleet (bikes still yours: not stolen). */
export async function getFleet(userId: string, db: Database | Tx = getDatabase()): Promise<FleetBike[]> {
  const rows = await db
    .select()
    .from(fleetBikes)
    .where(and(eq(fleetBikes.userId, userId), eq(fleetBikes.status, "ok")))
    .orderBy(fleetBikes.createdAt)
  return rows.map((row) => ({
    id: row.id,
    model: (findFleetModel(row.model)?.id ?? "boxa100") as FleetModelId,
    rider: row.rider,
    skill: row.skill,
    wear: row.wear,
    tracker: row.tracker
  }))
}

/** LivTok lives you've finished (each one is a livtok_sales entry, even with no sales). */
export async function livtokLives(userId: string, db: Database | Tx = getDatabase()): Promise<number> {
  const [row] = await db
    .select({ lives: count() })
    .from(coinLedger)
    .where(and(eq(coinLedger.userId, userId), eq(coinLedger.reason, "livtok_sales")))
  return Number(row?.lives ?? 0)
}

export type TownMoveUpResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "already" | "tier" | "experience" | "capital"; balance: number }

/**
 * Move up to Town business: a Small business owner with TOWN_LIVES_NEEDED
 * lives done and 5,000,000 saved. 2,000,000 of it becomes your first fleet:
 * STARTER_FLEET bikes, each with a rider (`riders`, hired by the caller).
 */
export async function moveUpToTownBusiness(
  userId: string,
  riders: ReadonlyArray<{ rider: string; skill: number }>,
  db: Database = getDatabase()
): Promise<TownMoveUpResult> {
  const town = findTierById("town")
  const lives = await livtokLives(userId, db)
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    const balance = await balanceOf(tx, userId)
    const tier = await getTier(userId, tx)
    if (tier !== "small") return { ok: false, reason: tier === "street" ? "tier" : "already", balance }
    if (lives < TOWN_LIVES_NEEDED) return { ok: false, reason: "experience", balance }
    if (balance < town.capital) return { ok: false, reason: "capital", balance }
    const inserted = await insertEntry(tx, {
      userId,
      delta: -town.invest,
      reason: "tier_up",
      refId: "town",
      meta: { tier: "town", bikes: STARTER_FLEET.count, model: STARTER_FLEET.model }
    })
    if (!inserted) return { ok: false, reason: "already", balance }
    const hired = riders.slice(0, STARTER_FLEET.count)
    await tx.insert(fleetBikes).values(hired.map((rider) => ({ userId, model: STARTER_FLEET.model, rider: rider.rider, skill: rider.skill })))
    if (!(await findNote(tx, userId, "tier_up", "town"))) {
      await tx.insert(lifeEvents).values({
        userId,
        kind: "tier_up",
        amount: town.invest,
        status: "info",
        meta: { ref: "town", tier: town.name }
      })
    }
    return { ok: true, balance: balance - town.invest }
  })
}

type Charge = { ok: true; balance: number } | { ok: false; reason: "insufficient" | "unknown" | "full" | "tier"; balance: number }

/** Buy a bike for the fleet (once per `refId`), with its new rider. */
export async function buyFleetBike(
  input: { userId: string; model: string; refId: string; rider: string; skill: number },
  db: Database = getDatabase()
): Promise<Charge & { bike?: FleetBike }> {
  const model = findFleetModel(input.model)
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    if (!model) return { ok: false, reason: "unknown", balance }
    const tier = await getTier(input.userId, tx)
    if (tier === "street" || tier === "small") return { ok: false, reason: "tier", balance }
    const [owned] = await tx
      .select({ bikes: count() })
      .from(fleetBikes)
      .where(and(eq(fleetBikes.userId, input.userId), eq(fleetBikes.status, "ok")))
    if (Number(owned?.bikes ?? 0) >= FLEET_MAX_BIKES) return { ok: false, reason: "full", balance }
    const price = fleetBikePrice(model.id)
    if (balance < price) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, { userId: input.userId, delta: -price, reason: "fleet_bike_buy", refId: input.refId, meta: { model: model.id, rider: input.rider } })
    if (!inserted) return { ok: true, balance }
    const [row] = await tx.insert(fleetBikes).values({ userId: input.userId, model: model.id, rider: input.rider, skill: input.skill }).returning()
    return {
      ok: true,
      balance: balance - price,
      bike: row ? { id: row.id, model: model.id, rider: row.rider, skill: row.skill, wear: row.wear, tracker: row.tracker } : undefined
    }
  })
}

async function ownBike(tx: Tx, userId: string, bikeId: string) {
  const [bike] = await tx
    .select()
    .from(fleetBikes)
    .where(and(eq(fleetBikes.id, bikeId), eq(fleetBikes.userId, userId), eq(fleetBikes.status, "ok")))
    .limit(1)
  return bike ?? null
}

/** Service a fleet bike back to no wear (cost grows with wear). */
export async function serviceFleetBike(input: { userId: string; bikeId: string; refId: string }, db: Database = getDatabase()): Promise<Charge & { cost?: number }> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    const bike = await ownBike(tx, input.userId, input.bikeId)
    if (!bike) return { ok: false, reason: "unknown", balance }
    const cost = fleetServiceCost(bike.wear)
    if (cost <= 0) return { ok: true, balance, cost: 0 }
    if (balance < cost) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, { userId: input.userId, delta: -cost, reason: "fleet_service", refId: input.refId, meta: { bike: bike.id, wear: bike.wear } })
    if (inserted) await tx.update(fleetBikes).set({ wear: 0 }).where(eq(fleetBikes.id, bike.id))
    return { ok: true, balance: inserted ? balance - cost : balance, cost }
  })
}

/** Fit a tracker (theft is usually recovered). */
export async function fitFleetTracker(input: { userId: string; bikeId: string; refId: string }, db: Database = getDatabase()): Promise<Charge> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    const bike = await ownBike(tx, input.userId, input.bikeId)
    if (!bike) return { ok: false, reason: "unknown", balance }
    if (bike.tracker) return { ok: true, balance }
    if (balance < TRACKER_PRICE) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, { userId: input.userId, delta: -TRACKER_PRICE, reason: "fleet_tracker", refId: input.refId, meta: { bike: bike.id } })
    if (inserted) await tx.update(fleetBikes).set({ tracker: true }).where(eq(fleetBikes.id, bike.id))
    return { ok: true, balance: inserted ? balance - TRACKER_PRICE : balance }
  })
}

/** Pay something during a shift (a repair, a fine, an advance), once per `refId`. */
export async function payFleetCost(
  input: { userId: string; refId: string; amount: number; meta: Record<string, unknown> },
  db: Database = getDatabase()
): Promise<Charge> {
  const amount = Math.max(0, Math.round(input.amount))
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    if (balance < amount) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, { userId: input.userId, delta: -amount, reason: "fleet_cost", refId: input.refId, meta: input.meta })
    return { ok: true, balance: inserted ? balance - amount : balance }
  })
}

export type FleetSettlement = {
  userId: string
  shiftId: string
  /** Dues, advances paid back and special-hire bonuses. */
  net: number
  /** Each bike's wear after the shift. */
  wear: Record<string, number>
  /** Bikes stolen and not recovered: they leave the fleet. */
  stolen: readonly string[]
  meta: Record<string, unknown>
}

/** After a shift: pay the dues (once per shift) and save wear and losses. */
export async function settleFleetShift(input: FleetSettlement, db: Database = getDatabase()): Promise<{ balance: number }> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const inserted = await insertEntry(tx, {
      userId: input.userId,
      delta: Math.max(0, Math.round(input.net)),
      reason: "fleet_dues",
      refId: input.shiftId,
      meta: input.meta
    })
    if (inserted) {
      for (const [bikeId, wear] of Object.entries(input.wear)) {
        await tx
          .update(fleetBikes)
          .set({ wear: Math.max(0, Math.min(100, wear)) })
          .where(and(eq(fleetBikes.id, bikeId), eq(fleetBikes.userId, input.userId)))
      }
      for (const bikeId of input.stolen) {
        await tx
          .update(fleetBikes)
          .set({ status: "stolen" })
          .where(and(eq(fleetBikes.id, bikeId), eq(fleetBikes.userId, input.userId)))
      }
    }
    return { balance: await balanceOf(tx, input.userId) }
  })
}

/**
 * SQL for one fleet_bikes row's value (fleetBikeValue in game-core: the
 * price, less wear, down to half at 100). Prices come from game-core.
 */
export const fleetBikeValueSql = sql`(case ${fleetBikes.model} ${sql.raw(
  FLEET_MODELS.map((model) => `when '${model.id}' then ${fleetBikePrice(model.id)}`).join(" ")
)} else ${sql.raw(String(fleetBikePrice("boxa100")))} end * (1 - least(${fleetBikes.wear}, 100) / 200.0))`

/** What the fleet is worth (for net worth on the Rich List). */
export async function fleetValue(userId: string, db: Database | Tx = getDatabase()): Promise<number> {
  const [row] = await db
    .select({ value: sql<string>`coalesce(sum(${fleetBikeValueSql}), 0)` })
    .from(fleetBikes)
    .where(and(eq(fleetBikes.userId, userId), eq(fleetBikes.status, "ok")))
  return Math.round(Number(row?.value ?? 0))
}
