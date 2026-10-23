import { and, eq, sql } from "drizzle-orm"
import { MAX_PLOTS_PER_PLAYER, RENT_WEEK_MS, findPlot, rentState, rentWeeksPayable, weeklyGroundRent, type RentState } from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, insertEntry, lockUser, type Tx } from "./ledger.js"
import { coinLedger, landPlots, users } from "./schema.js"

// Claiming land and paying its ground rent (docs/land.md). A plot is bought
// outright (plus its first week's rent); rent is then paid ahead, week by
// week; more than RENT_GRACE_WEEKS behind and the plot is back on the market
// for anyone to claim. Ledger reasons: land_claim, land_rent.

/** A claimed plot as everyone sees it on the map. */
export type ClaimedPlot = { plotId: string; ownerId: string; ownerName: string; rent: Exclude<RentState, "lapsed"> }

/** A plot you hold, with where its rent stands. */
export type MyPlot = {
  plotId: string
  price: number
  claimedAt: string
  rentPaidUntil: string
  rent: Exclude<RentState, "lapsed">
  weeklyRent: number
  weeksPayable: number
}

/** Every plot someone holds right now (lapsed ones count as free). */
export async function listClaimedPlots(db: Database = getDatabase(), now = new Date()): Promise<ClaimedPlot[]> {
  const rows = await db
    .select({ plotId: landPlots.plotId, ownerId: landPlots.userId, ownerName: users.displayName, rentPaidUntil: landPlots.rentPaidUntil })
    .from(landPlots)
    .innerJoin(users, eq(users.id, landPlots.userId))
  return rows.flatMap((row) => {
    const rent = rentState(row.rentPaidUntil, now)
    return rent === "lapsed" ? [] : [{ plotId: row.plotId, ownerId: row.ownerId, ownerName: row.ownerName, rent }]
  })
}

export async function getMyPlots(userId: string, db: Database | Tx = getDatabase(), now = new Date()): Promise<MyPlot[]> {
  const rows = await db.select().from(landPlots).where(eq(landPlots.userId, userId)).orderBy(landPlots.claimedAt)
  return rows.flatMap((row) => {
    const rent = rentState(row.rentPaidUntil, now)
    if (rent === "lapsed") return []
    return [
      {
        plotId: row.plotId,
        price: row.price,
        claimedAt: row.claimedAt.toISOString(),
        rentPaidUntil: row.rentPaidUntil.toISOString(),
        rent,
        weeklyRent: weeklyGroundRent(row.price),
        weeksPayable: rentWeeksPayable(row.rentPaidUntil, now)
      }
    ]
  })
}

/** One plot at a time: two players claiming the same plot queue up. */
async function lockPlot(tx: Tx, plotId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`land:${plotId}`}))`)
}

export type ClaimResult =
  | { ok: true; plot: MyPlot | null; balance: number }
  | { ok: false; reason: "unknown" | "taken" | "limit" | "insufficient"; balance: number }

/** Claim a free plot (once per `refId`): its price plus the first week's ground rent. */
export async function claimPlot(input: { userId: string; plotId: string; refId: string }, db: Database = getDatabase()): Promise<ClaimResult> {
  const plot = findPlot(input.plotId)
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    if (!plot) return { ok: false, reason: "unknown", balance }
    await lockPlot(tx, plot.id)
    const now = new Date()
    const [existing] = await tx.select().from(landPlots).where(eq(landPlots.plotId, plot.id)).limit(1)
    if (existing && rentState(existing.rentPaidUntil, now) !== "lapsed") {
      // Already yours from this same claim (a retry), or someone else's.
      if (existing.userId === input.userId) {
        const mine = (await getMyPlots(input.userId, tx, now)).find((p) => p.plotId === plot.id) ?? null
        return { ok: true, plot: mine, balance }
      }
      return { ok: false, reason: "taken", balance }
    }
    if ((await getMyPlots(input.userId, tx, now)).length >= MAX_PLOTS_PER_PLAYER) return { ok: false, reason: "limit", balance }
    const rent = weeklyGroundRent(plot.price)
    if (balance < plot.price + rent) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, { userId: input.userId, delta: -plot.price, reason: "land_claim", refId: input.refId, meta: { plot: plot.id, area: plot.area } })
    if (!inserted) return { ok: true, plot: null, balance }
    await insertEntry(tx, { userId: input.userId, delta: -rent, reason: "land_rent", refId: `${input.refId}:first`, meta: { plot: plot.id, weeks: 1 } })
    const row = { plotId: plot.id, userId: input.userId, price: plot.price, claimedAt: now, rentPaidUntil: new Date(now.getTime() + RENT_WEEK_MS), building: null }
    // A lapsed plot's row is taken over (and whatever was built on it goes).
    await tx.insert(landPlots).values(row).onConflictDoUpdate({ target: landPlots.plotId, set: { userId: row.userId, price: row.price, claimedAt: row.claimedAt, rentPaidUntil: row.rentPaidUntil, building: null } })
    const mine = (await getMyPlots(input.userId, tx, now)).find((p) => p.plotId === plot.id) ?? null
    return { ok: true, plot: mine, balance: balance - plot.price - rent }
  })
}

export type RentResult =
  | { ok: true; plot: MyPlot | null; charged: number; balance: number }
  | { ok: false; reason: "unknown" | "weeks" | "insufficient"; balance: number }

/** Pay `weeks` of ground rent on a plot you hold (once per `refId`). */
export async function payGroundRent(input: { userId: string; plotId: string; weeks: number; refId: string }, db: Database = getDatabase()): Promise<RentResult> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    await lockPlot(tx, input.plotId)
    const now = new Date()
    const [row] = await tx.select().from(landPlots).where(eq(landPlots.plotId, input.plotId)).limit(1)
    if (!row || row.userId !== input.userId || rentState(row.rentPaidUntil, now) === "lapsed") return { ok: false, reason: "unknown", balance }
    // A retry of a payment that already went through.
    const [done] = await tx
      .select({ id: coinLedger.id })
      .from(coinLedger)
      .where(and(eq(coinLedger.userId, input.userId), eq(coinLedger.reason, "land_rent"), eq(coinLedger.refId, input.refId)))
      .limit(1)
    if (done) return { ok: true, plot: (await getMyPlots(input.userId, tx, now)).find((p) => p.plotId === row.plotId) ?? null, charged: 0, balance }
    const weeks = Math.floor(input.weeks)
    if (!(weeks >= 1) || weeks > rentWeeksPayable(row.rentPaidUntil, now)) return { ok: false, reason: "weeks", balance }
    const charge = weeklyGroundRent(row.price) * weeks
    if (balance < charge) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, { userId: input.userId, delta: -charge, reason: "land_rent", refId: input.refId, meta: { plot: row.plotId, weeks } })
    if (inserted) {
      await tx
        .update(landPlots)
        .set({ rentPaidUntil: new Date(row.rentPaidUntil.getTime() + weeks * RENT_WEEK_MS) })
        .where(eq(landPlots.plotId, row.plotId))
    }
    const mine = (await getMyPlots(input.userId, tx, now)).find((p) => p.plotId === row.plotId) ?? null
    return { ok: true, plot: mine, charged: inserted ? charge : 0, balance: inserted ? balance - charge : balance }
  })
}
