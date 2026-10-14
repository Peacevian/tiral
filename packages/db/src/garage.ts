import { and, desc, eq, ne } from "drizzle-orm"
import {
  BREAKDOWN_REPAIR,
  HOUR_MS,
  LEASE_GRACE_HOURS,
  RENT_PERIOD_HOURS,
  RENTAL_BIKE_LOOK,
  bikeWearPerKm,
  canBuy,
  canLease,
  findBikeModel,
  leaseTerms,
  serviceCost,
  isValidBikeLook,
  lookCost,
  lookItemIds,
  plainBikeLook,
  type BikeLook,
  type BikeModelId
} from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, insertEntry, lockUser, type Tx } from "./ledger.js"
import { bikeItems, bikes, coinLedger, lifeEvents, type BikeRow } from "./schema.js"

export type BikeView = {
  id: string
  model: string
  name: string
  status: "owned" | "leasing" | "repossessed"
  active: boolean
  look: BikeLook
  wear: number
  serviceCost: number
  lease: { weekly: number; weeksPaid: number; weeksTotal: number; dueAt: string | null; missedAt: string | null } | null
}

function lookOf(row: BikeRow): BikeLook {
  return { ...RENTAL_BIKE_LOOK, ...(row.look as Partial<BikeLook> | null), model: row.model as BikeLook["model"] }
}

export function viewBike(row: BikeRow): BikeView {
  return {
    id: row.id,
    model: row.model,
    name: findBikeModel(row.model).name,
    status: row.status as BikeView["status"],
    active: row.active,
    look: lookOf(row),
    wear: Math.round(row.wear * 10) / 10,
    serviceCost: serviceCost(row.model),
    lease:
      row.leaseWeekly !== null && row.leaseWeeksTotal !== null
        ? {
            weekly: row.leaseWeekly,
            weeksPaid: row.leaseWeeksPaid,
            weeksTotal: row.leaseWeeksTotal,
            dueAt: row.leaseDueAt?.toISOString() ?? null,
            missedAt: row.leaseMissedAt?.toISOString() ?? null
          }
        : null
  }
}

async function notice(tx: Tx, userId: string, kind: string, meta: Record<string, unknown>, amount = 0, at = new Date()) {
  await tx.insert(lifeEvents).values({ userId, kind, amount, status: "info", meta, createdAt: at })
}

/**
 * Catch lease payments up to now (called whenever the player shows up, like
 * rent): pay each week that's due if you can; a missed week gets a grace
 * period, then the bike is repossessed and the payments so far are lost.
 */
export async function settleLeases(tx: Tx, userId: string, now = new Date()) {
  const leasing = await tx
    .select()
    .from(bikes)
    .where(and(eq(bikes.userId, userId), eq(bikes.status, "leasing")))
  for (const bike of leasing) {
    let { leaseDueAt: dueAt, leaseWeeksPaid: paid, leaseMissedAt: missedAt } = bike
    let status: BikeRow["status"] = bike.status
    let active = bike.active
    const weekly = bike.leaseWeekly ?? 0
    const total = bike.leaseWeeksTotal ?? 0
    const name = findBikeModel(bike.model).name
    for (let guard = 0; guard < 12 && dueAt && dueAt.getTime() <= now.getTime() && status === "leasing"; guard++) {
      const balance = await balanceOf(tx, userId)
      if (balance >= weekly) {
        await insertEntry(tx, {
          userId,
          delta: -weekly,
          reason: "bike_lease",
          refId: `${bike.id}:${paid + 1}`,
          meta: { model: bike.model, week: paid + 1, of: total }
        })
        paid++
        missedAt = null
        if (paid >= total) {
          status = "owned"
          dueAt = null
          await notice(tx, userId, "lease_done", { name })
        } else {
          await notice(tx, userId, "lease_paid", { name, week: paid, of: total }, weekly, dueAt)
          dueAt = new Date(dueAt.getTime() + RENT_PERIOD_HOURS * HOUR_MS)
        }
        continue
      }
      // Can't pay this week.
      if (!missedAt) {
        missedAt = dueAt
        await notice(tx, userId, "lease_missed", { name, weekly, graceHours: LEASE_GRACE_HOURS }, weekly, dueAt)
      }
      if (now.getTime() - missedAt.getTime() >= LEASE_GRACE_HOURS * HOUR_MS) {
        status = "repossessed"
        active = false
        await notice(tx, userId, "bike_repossessed", { name, paid, of: total })
      }
      break
    }
    if (dueAt !== bike.leaseDueAt || paid !== bike.leaseWeeksPaid || missedAt !== bike.leaseMissedAt || status !== bike.status) {
      await tx
        .update(bikes)
        .set({ leaseDueAt: dueAt, leaseWeeksPaid: paid, leaseMissedAt: missedAt, status, active })
        .where(eq(bikes.id, bike.id))
    }
  }
}

export type Garage = { bikes: BikeView[]; activeBikeId: string | null; items: string[] }

/** The player's bikes (repossessed ones too, so they know what happened). */
export async function getGarage(userId: string, db: Database = getDatabase()): Promise<Garage> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    await settleLeases(tx, userId)
    const rows = await tx.select().from(bikes).where(eq(bikes.userId, userId)).orderBy(desc(bikes.createdAt))
    const active = rows.find((row) => row.active && row.status !== "repossessed")
    const owned = await tx.select({ itemId: bikeItems.itemId }).from(bikeItems).where(eq(bikeItems.userId, userId))
    return { bikes: rows.map(viewBike), activeBikeId: active?.id ?? null, items: owned.map((row) => row.itemId) }
  })
}

export type GarageResult = { ok: true } | { ok: false; reason: "insufficient" | "not_allowed" | "not_found" }

/** A repeated request (double tap, retry) already went through: report success, charge nothing. */
async function alreadyDone(tx: Tx, userId: string, reason: string, refId: string) {
  const [row] = await tx
    .select({ id: coinLedger.id })
    .from(coinLedger)
    .where(and(eq(coinLedger.userId, userId), eq(coinLedger.reason, reason), eq(coinLedger.refId, refId)))
    .limit(1)
  return Boolean(row)
}

async function addBike(
  tx: Tx,
  userId: string,
  values: Omit<typeof bikes.$inferInsert, "userId" | "active">
): Promise<string> {
  // The new bike becomes the one you ride.
  await tx.update(bikes).set({ active: false }).where(eq(bikes.userId, userId))
  const [row] = await tx
    .insert(bikes)
    .values({ ...values, userId, active: true })
    .returning({ id: bikes.id })
  return row!.id
}

export async function buyBike(input: { userId: string; model: string; purchaseId: string }, db: Database = getDatabase()): Promise<GarageResult> {
  if (!canBuy(input.model)) return { ok: false, reason: "not_allowed" }
  const price = findBikeModel(input.model).price ?? 0
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    if (await alreadyDone(tx, input.userId, "bike_buy", input.purchaseId)) return { ok: true }
    if ((await balanceOf(tx, input.userId)) < price) return { ok: false, reason: "insufficient" }
    const charged = await insertEntry(tx, {
      userId: input.userId,
      delta: -price,
      reason: "bike_buy",
      refId: input.purchaseId,
      meta: { model: input.model }
    })
    if (!charged) return { ok: true }
    await addBike(tx, input.userId, { model: input.model, status: "owned", look: plainBikeLook(input.model as BikeModelId) })
    return { ok: true }
  })
}

export async function leaseBike(input: { userId: string; model: string; purchaseId: string }, db: Database = getDatabase()): Promise<GarageResult> {
  const terms = leaseTerms(input.model)
  if (!canLease(input.model) || !terms) return { ok: false, reason: "not_allowed" }
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    if (await alreadyDone(tx, input.userId, "bike_lease_deposit", input.purchaseId)) return { ok: true }
    if ((await balanceOf(tx, input.userId)) < terms.deposit) return { ok: false, reason: "insufficient" }
    const charged = await insertEntry(tx, {
      userId: input.userId,
      delta: -terms.deposit,
      reason: "bike_lease_deposit",
      refId: input.purchaseId,
      meta: { model: input.model }
    })
    if (!charged) return { ok: true }
    await addBike(tx, input.userId, {
      model: input.model,
      status: "leasing",
      look: plainBikeLook(input.model as BikeModelId),
      leaseWeekly: terms.weekly,
      leaseWeeksTotal: terms.weeks,
      leaseWeeksPaid: 0,
      leaseDueAt: new Date(Date.now() + RENT_PERIOD_HOURS * HOUR_MS)
    })
    return { ok: true }
  })
}

export async function serviceBike(input: { userId: string; bikeId: string; purchaseId: string }, db: Database = getDatabase()): Promise<GarageResult> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const [bike] = await tx
      .select()
      .from(bikes)
      .where(and(eq(bikes.id, input.bikeId), eq(bikes.userId, input.userId), ne(bikes.status, "repossessed")))
      .limit(1)
    if (!bike) return { ok: false, reason: "not_found" }
    const cost = serviceCost(bike.model)
    if (await alreadyDone(tx, input.userId, "bike_service", input.purchaseId)) return { ok: true }
    if ((await balanceOf(tx, input.userId)) < cost) return { ok: false, reason: "insufficient" }
    const charged = await insertEntry(tx, {
      userId: input.userId,
      delta: -cost,
      reason: "bike_service",
      refId: input.purchaseId,
      meta: { model: bike.model, wear: Math.round(bike.wear) }
    })
    if (charged) await tx.update(bikes).set({ wear: 0 }).where(eq(bikes.id, bike.id))
    return { ok: true }
  })
}

/** Ride this bike (or null for the stage rental). */
export async function setActiveBike(input: { userId: string; bikeId: string | null }, db: Database = getDatabase()): Promise<GarageResult> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    if (input.bikeId) {
      const [bike] = await tx
        .select({ id: bikes.id })
        .from(bikes)
        .where(and(eq(bikes.id, input.bikeId), eq(bikes.userId, input.userId), ne(bikes.status, "repossessed")))
        .limit(1)
      if (!bike) return { ok: false, reason: "not_found" }
    }
    await tx.update(bikes).set({ active: false }).where(eq(bikes.userId, input.userId))
    if (input.bikeId) await tx.update(bikes).set({ active: true }).where(eq(bikes.id, input.bikeId))
    return { ok: true }
  })
}

/** The bike a boda shift uses: your active owned/leased bike, or null for the rental. */
export async function getRideBike(userId: string, db: Database = getDatabase()): Promise<BikeView | null> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    await settleLeases(tx, userId)
    const [row] = await tx
      .select()
      .from(bikes)
      .where(and(eq(bikes.userId, userId), eq(bikes.active, true), ne(bikes.status, "repossessed")))
      .limit(1)
    return row ? viewBike(row) : null
  })
}

/** Add wear for distance ridden; returns the new wear. */
export async function addBikeWear(input: { bikeId: string; km: number }, db: Database = getDatabase()): Promise<number> {
  const [bike] = await db.select().from(bikes).where(eq(bikes.id, input.bikeId)).limit(1)
  if (!bike) return 0
  const wear = Math.min(100, bike.wear + input.km * bikeWearPerKm(findBikeModel(bike.model).stats))
  await db.update(bikes).set({ wear }).where(eq(bikes.id, bike.id))
  return wear
}

/** Roadside repair after a breakdown: takes what you have, up to the repair cost. */
export async function chargeBreakdown(input: { userId: string; refId: string; model: string }, db: Database = getDatabase()): Promise<number> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const charge = Math.min(BREAKDOWN_REPAIR, await balanceOf(tx, input.userId))
    if (charge > 0) {
      await insertEntry(tx, { userId: input.userId, delta: -charge, reason: "bike_repair", refId: input.refId, meta: { model: input.model } })
    }
    await notice(tx, input.userId, "breakdown", { name: findBikeModel(input.model).name, charged: charge }, charge)
    return charge
  })
}

export type CustomizeResult =
  | { ok: true; charged: number }
  | { ok: false; reason: "insufficient" | "not_found" | "invalid" }

/**
 * Put a new look on one of your bikes. Items you don't own yet are bought (once,
 * then usable on any bike); items already on this bike count as owned.
 */
export async function customizeBike(
  input: { userId: string; bikeId: string; look: BikeLook; purchaseId: string },
  db: Database = getDatabase()
): Promise<CustomizeResult> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const [bike] = await tx
      .select()
      .from(bikes)
      .where(and(eq(bikes.id, input.bikeId), eq(bikes.userId, input.userId), ne(bikes.status, "repossessed")))
      .limit(1)
    if (!bike) return { ok: false, reason: "not_found" }
    const look: BikeLook = { ...input.look, model: bike.model as BikeModelId }
    if (!isValidBikeLook(look)) return { ok: false, reason: "invalid" }
    if (await alreadyDone(tx, input.userId, "bike_items", input.purchaseId)) return { ok: true, charged: 0 }
    const ownedRows = await tx.select({ itemId: bikeItems.itemId }).from(bikeItems).where(eq(bikeItems.userId, input.userId))
    const owned = new Set([...ownedRows.map((row) => row.itemId), ...lookItemIds(lookOf(bike))])
    const { items, total } = lookCost(look, owned)
    if (total > 0) {
      if ((await balanceOf(tx, input.userId)) < total) return { ok: false, reason: "insufficient" }
      await insertEntry(tx, {
        userId: input.userId,
        delta: -total,
        reason: "bike_items",
        refId: input.purchaseId,
        meta: { items: items.map((item) => item.id) }
      })
    }
    // Remember everything this look uses (incl. items grandfathered from the bike) as owned.
    const toRecord = lookItemIds(look).filter((id) => !ownedRows.some((row) => row.itemId === id))
    if (toRecord.length > 0) {
      await tx
        .insert(bikeItems)
        .values(toRecord.map((itemId) => ({ userId: input.userId, itemId })))
        .onConflictDoNothing()
    }
    await tx.update(bikes).set({ look }).where(eq(bikes.id, bike.id))
    return { ok: true, charged: total }
  })
}
