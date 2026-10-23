import { and, desc, eq, gte, sql } from "drizzle-orm"
import {
  HOUR_MS,
  RENT_PERIOD_HOURS,
  REQUEST_EXPIRY_HOURS,
  STRESS,
  STRESS_START,
  addStress,
  currentStress,
  eventsDue,
  findLifeEvent,
  findTier,
  homeOpenTo,
  kampalaDay,
  kampalaDayStart,
  pickLifeEvent,
  ownHouseLook,
  settleRent,
  type HousingTierId
} from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, insertEntry, lockUser, lockUserRow, type Tx } from "./ledger.js"
import { coinLedger, lifeEvents, users } from "./schema.js"
import { settleLeases } from "./garage.js"
import { getTier } from "./livtok.js"
import { countHouseItems } from "./house.js"
import { movingFee } from "@tiral/houses"
import { ownHome } from "./land.js"

export type LifeEventView = {
  id: string
  kind: string
  amount: number
  status: string
  from: string
  text: string
  createdAt: string
  /** Requests only: when it stops waiting for an answer. */
  expiresAt: string | null
}

export type LifeState = {
  /** Where you live: a rented home, or (id = its look) the house you built. */
  tier: { id: string; name: string; rent: number }
  /** Living in the house you built on your plot (no rent while it stands). */
  ownHome: { plotId: string; areaName: string } | null
  rentDueAt: string
  stress: number
  balance: number
  pending: number
  events: LifeEventView[]
}

const RENT_NOTICE_TEXT: Record<string, (meta: Record<string, unknown>) => { from: string; text: string }> = {
  rent_paid: (meta) => ({
    from: "Landlord",
    text: `Rent paid: ${Number(meta.amount ?? 0).toLocaleString("en-US")} for ${findTier(String(meta.tier)).name}.`
  }),
  evicted: (meta) => ({
    from: "Landlord",
    text: `You couldn't make rent, so you moved down to ${findTier(String(meta.to)).name}.`
  }),
  home_lost: (meta) => ({
    from: "Land office",
    text: `The house on your plot is gone, so you're back at ${findTier(String(meta.to)).name}. Rent is due there again.`
  }),
  rent_grace: (meta) => ({
    from: "Landlord",
    text: `Rent of ${Number(meta.amount ?? 0).toLocaleString("en-US")} missed. "Just this once," he said.`
  }),
  lease_paid: (meta) => ({
    from: "Bike lessor",
    text: `Lease payment for your ${String(meta.name)}: week ${Number(meta.week)} of ${Number(meta.of)} paid.`
  }),
  lease_done: (meta) => ({
    from: "Bike lessor",
    text: `Last lease payment made. The ${String(meta.name)} is yours now!`
  }),
  lease_missed: (meta) => ({
    from: "Bike lessor",
    text: `You missed this week's ${Number(meta.weekly ?? 0).toLocaleString("en-US")} for the ${String(meta.name)}. Pay within 2 days or we take the bike back.`
  }),
  bike_repossessed: (meta) => ({
    from: "Bike lessor",
    text: `We took the ${String(meta.name)} back. ${Number(meta.paid)} of ${Number(meta.of)} payments made, and they're gone.`
  }),
  kcca_raid: (meta) => ({
    from: "KCCA",
    text: `KCCA raided your rolex stand and took it. Fine: ${Number(meta.charged ?? 0).toLocaleString("en-US")}.`
  }),
  breakdown: (meta) => ({
    from: "Mechanic",
    text: `Your ${String(meta.name)} broke down mid-ride. Roadside repair: ${Number(meta.charged ?? 0).toLocaleString("en-US")}.`
  }),
  // Prize races (packages/db/src/prizes.ts).
  prize_won: (meta) => ({
    from: `${String(meta.host)}'s prize race`,
    text: `🏆 You came ${ordinal(Number(meta.place))} and won ${bng(meta.amount)} BNG!`
  }),
  prize_paid: (meta) => ({
    from: "Your prize race",
    text: `Paid ${bng(meta.paid)} BNG to ${Number(meta.winners)} winner${Number(meta.winners) === 1 ? "" : "s"}. Tiral's 10% cut: ${bng(meta.cut)}.${
      Number(meta.unclaimed) > 0 ? ` ${bng(meta.unclaimed)} BNG nobody finished to claim came back to you.` : ""
    }`
  }),
  prize_refund: (meta) => ({
    from: "Your prize race",
    text: `Your ${bng(meta.amount)} BNG pot came back to you: ${PRIZE_REFUND_WHY[String(meta.why)] ?? "the race didn't happen"}.`
  }),
  // Career tiers (packages/db/src/livtok.ts).
  tier_up: (meta) => ({
    from: "Owino traders",
    text: `🏪 You're a ${String(meta.tier ?? "Small business")} owner now! Your first bale is in stock: go live on LivTok and sell.`
  }),
  // The hustle ladder (packages/db/src/ladder.ts).
  ladder_unlock: (meta) => ({ from: String(meta.from ?? "Kampala"), text: `🔓 ${String(meta.text ?? "")}` }),
  race_reminder: (meta) => ({
    from: `${String(meta.host)}'s prize race`,
    text: `Starts at ${kampalaClock(String(meta.startsAt))} for ${bng(meta.pot)} BNG. Join with code ${String(meta.code)}.`
  })
}

const PRIZE_REFUND_WHY: Record<string, string> = {
  cancelled: "you cancelled the race",
  few_racers: "fewer than 2 other people raced",
  no_finishers: "nobody reached the treasure",
  missed: "the race couldn't start on time",
  no_players: "nobody joined"
}

const bng = (value: unknown) => Number(value ?? 0).toLocaleString("en-US")
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`
const kampalaClock = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Kampala", weekday: "short", hour: "2-digit", minute: "2-digit" })

function viewEvent(row: typeof lifeEvents.$inferSelect): LifeEventView {
  const meta = row.meta ?? {}
  const known = findLifeEvent(row.kind)
  const notice = RENT_NOTICE_TEXT[row.kind]?.(meta)
  const from = known?.from ?? notice?.from ?? "Kampala"
  const text = known?.text ?? notice?.text ?? row.kind
  const expiresAt =
    row.status === "pending" ? new Date(row.createdAt.getTime() + REQUEST_EXPIRY_HOURS * HOUR_MS).toISOString() : null
  return {
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    status: row.status,
    from,
    text,
    createdAt: row.createdAt.toISOString(),
    expiresAt
  }
}

/** Where you live, as LifeState shows it. */
function homeView(houseTier: string, own: { plotId: string; floors: number; areaName: string } | null) {
  if (own) return { tier: { id: ownHouseLook(own.floors), name: `Your house, ${own.areaName}`, rent: 0 }, ownHome: { plotId: own.plotId, areaName: own.areaName } }
  const tier = findTier(houseTier)
  return { tier: { id: tier.id, name: tier.name, rent: tier.rent }, ownHome: null }
}

async function readLifeRow(tx: Tx | Database, userId: string) {
  const rows = await tx
    .select({
      houseTier: users.houseTier,
      homePlotId: users.homePlotId,
      rentDueAt: users.rentDueAt,
      stress: users.stress,
      stressAt: users.stressAt,
      calmFactor: users.calmFactor,
      lastEventAt: users.lastEventAt
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The player's life as it stands, without settling anything: no lock, no
 * writes. Same shape as syncLife; the app shell polls this between syncs.
 */
export async function readLife(userId: string, db: Database = getDatabase()): Promise<LifeState | null> {
  const row = await readLifeRow(db, userId)
  if (!row) return null
  const now = new Date()
  const [balance, events] = await Promise.all([
    balanceOf(db, userId),
    db.select().from(lifeEvents).where(eq(lifeEvents.userId, userId)).orderBy(desc(lifeEvents.createdAt)).limit(20)
  ])
  const rentDueAt = row.rentDueAt ?? new Date(now.getTime() + RENT_PERIOD_HOURS * HOUR_MS)
  return {
    ...homeView(row.houseTier, await ownHome(userId, row.homePlotId, db, now)),
    rentDueAt: rentDueAt.toISOString(),
    stress: currentStress(row.stress ?? STRESS_START, row.stressAt, now, row.calmFactor),
    balance,
    pending: events.filter((event) => event.status === "pending").length,
    events: events.map(viewEvent)
  }
}

/**
 * Catch the player's life up to now: expire unanswered requests, settle every
 * rent period that has come due, deliver new requests/shocks, ease stress.
 * Runs whenever they open the app — no background jobs. Idempotent per call.
 */
export async function syncLife(userId: string, db: Database = getDatabase()): Promise<LifeState | null> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    // Stress is read here and written back below.
    await lockUserRow(tx, userId)
    const row = await readLifeRow(tx, userId)
    if (!row) return null
    const now = new Date()
    let stress = currentStress(row.stress ?? STRESS_START, row.stressAt, now, row.calmFactor)
    let balance = await balanceOf(tx, userId)
    // First visit starts the rent clock.
    const rentDueAt = row.rentDueAt ?? new Date(now.getTime() + RENT_PERIOD_HOURS * HOUR_MS)

    // 1. Requests left unanswered count as a refusal.
    const pending = await tx
      .select()
      .from(lifeEvents)
      .where(and(eq(lifeEvents.userId, userId), eq(lifeEvents.status, "pending")))
    let stillPending = 0
    for (const event of pending) {
      if (now.getTime() - event.createdAt.getTime() >= REQUEST_EXPIRY_HOURS * HOUR_MS) {
        await tx
          .update(lifeEvents)
          .set({ status: "expired", resolvedAt: now })
          .where(eq(lifeEvents.id, event.id))
        stress = addStress(stress, findLifeEvent(event.kind)?.refuseStress ?? 0)
      } else {
        stillPending++
      }
    }

    // 2. Rent: none while you live in the house you built (the clock rolls on,
    // so moving back to a rented home starts a fresh period). If that house
    // is gone (plot lost or knocked down), you're back in your rented home.
    const own = await ownHome(userId, row.homePlotId, tx, now)
    if (row.homePlotId && !own) {
      await tx.update(users).set({ homePlotId: null }).where(eq(users.id, userId))
      await tx.insert(lifeEvents).values({ userId, kind: "home_lost", amount: 0, status: "info", meta: { plot: row.homePlotId, to: row.houseTier } })
    }
    const settlement = own
      ? { tier: row.houseTier as HousingTierId, rentDueAt: new Date(Math.max(rentDueAt.getTime(), now.getTime() + RENT_PERIOD_HOURS * HOUR_MS)), notices: [], charged: 0, stressDelta: 0 }
      : settleRent({ tier: row.houseTier, rentDueAt, balance }, now)
    for (const notice of settlement.notices) {
      const meta =
        notice.kind === "evicted"
          ? { from: notice.from, to: notice.to, dueAt: notice.dueAt.toISOString() }
          : { tier: notice.tier, amount: notice.amount, dueAt: notice.dueAt.toISOString() }
      if (notice.kind === "rent_paid") {
        const paid = await insertEntry(tx, {
          userId,
          delta: -notice.amount,
          reason: "rent",
          refId: `rent:${notice.dueAt.toISOString()}`,
          meta
        })
        if (!paid) continue
      }
      await tx.insert(lifeEvents).values({
        userId,
        kind: notice.kind,
        amount: notice.kind === "evicted" ? 0 : notice.amount,
        status: "info",
        meta,
        createdAt: notice.dueAt
      })
    }
    balance -= settlement.charged
    stress = addStress(stress, settlement.stressDelta)

    // Lease payments on a bike come due the same way.
    await settleLeases(tx, userId, now)
    balance = await balanceOf(tx, userId)

    // 3. New requests and shocks.
    const owed = eventsDue(row.lastEventAt, now, stillPending)
    const recent = pending.map((event) => event.kind)
    for (let i = 0; i < owed; i++) {
      const def = pickLifeEvent(Math.random(), recent)
      recent.push(def.id)
      if (def.type === "request") {
        await tx.insert(lifeEvents).values({ userId, kind: def.id, amount: def.amount, status: "pending" })
      } else {
        // Shocks just happen: take what you have; anything you couldn't cover hurts.
        const charge = Math.min(balance, def.amount)
        const [created] = await tx
          .insert(lifeEvents)
          .values({ userId, kind: def.id, amount: def.amount, status: "paid", resolvedAt: now, meta: { charged: charge } })
          .returning({ id: lifeEvents.id })
        if (charge > 0 && created) {
          await insertEntry(tx, { userId, delta: -charge, reason: "shock", refId: created.id, meta: { kind: def.id } })
          balance -= charge
        }
        if (charge < def.amount) stress = addStress(stress, STRESS.shockUncovered)
      }
    }

    await tx
      .update(users)
      .set({
        houseTier: settlement.tier,
        rentDueAt: settlement.rentDueAt,
        stress,
        stressAt: now,
        // First visit starts the event clock (see eventsDue).
        lastEventAt: owed > 0 ? now : row.lastEventAt ?? now
      })
      .where(eq(users.id, userId))

    const events = await tx
      .select()
      .from(lifeEvents)
      .where(eq(lifeEvents.userId, userId))
      .orderBy(desc(lifeEvents.createdAt))
      .limit(20)
    return {
      ...homeView(settlement.tier, own),
      rentDueAt: settlement.rentDueAt.toISOString(),
      stress,
      balance,
      pending: events.filter((event) => event.status === "pending").length,
      events: events.map(viewEvent)
    }
  })
}

export type ResolveResult = { ok: true } | { ok: false; reason: "not_pending" | "insufficient" }

/** Pay or refuse a family request. */
export async function resolveLifeEvent(
  input: { userId: string; eventId: string; action: "pay" | "refuse" },
  db: Database = getDatabase()
): Promise<ResolveResult> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const [event] = await tx
      .select()
      .from(lifeEvents)
      .where(and(eq(lifeEvents.id, input.eventId), eq(lifeEvents.userId, input.userId)))
      .limit(1)
    if (!event || event.status !== "pending") return { ok: false, reason: "not_pending" }
    // Stress is read here and written back below.
    await lockUserRow(tx, input.userId)
    const row = await readLifeRow(tx, input.userId)
    const now = new Date()
    let stress = row ? currentStress(row.stress, row.stressAt, now, row.calmFactor) : STRESS_START
    if (input.action === "pay") {
      const balance = await balanceOf(tx, input.userId)
      if (balance < event.amount) return { ok: false, reason: "insufficient" }
      await insertEntry(tx, {
        userId: input.userId,
        delta: -event.amount,
        reason: "family",
        refId: event.id,
        meta: { kind: event.kind }
      })
      stress = addStress(stress, STRESS.requestPaid)
    } else {
      stress = addStress(stress, findLifeEvent(event.kind)?.refuseStress ?? 0)
    }
    await tx
      .update(lifeEvents)
      .set({ status: input.action === "pay" ? "paid" : "refused", resolvedAt: now })
      .where(eq(lifeEvents.id, event.id))
    await tx.update(users).set({ stress, stressAt: now }).where(eq(users.id, input.userId))
    return { ok: true }
  })
}

/**
 * Move house: the new rent applies from the next due date. The big homes need
 * a career tier (HOME_CAREER); false when yours is too low.
 */
export async function moveHouse(
  userId: string,
  tierId: HousingTierId,
  db: Database = getDatabase()
): Promise<{ ok: true; fee: number } | { ok: false; reason: "career" | "insufficient" | "same"; fee: number }> {
  // Rent is settled against the house tier under the coin lock (syncLife): move under it too.
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    if (!homeOpenTo(tierId, await getTier(userId, tx))) return { ok: false, reason: "career", fee: 0 }
    const [user] = await tx.select({ houseTier: users.houseTier, home: users.homePlotId }).from(users).where(eq(users.id, userId)).limit(1)
    // Living in your own house, moving back to the same rented home is a move.
    if (user?.houseTier === tierId && !user.home) return { ok: false, reason: "same", fee: 0 }
    // Your furniture comes with you: a boda, a pickup or a lorry.
    const { fee, by } = movingFee(await countHouseItems(userId, tx))
    if (fee > 0) {
      if ((await balanceOf(tx, userId)) < fee) return { ok: false, reason: "insufficient", fee }
      await insertEntry(tx, { userId, delta: -fee, reason: "house_move", refId: `${tierId}:${Date.now()}`, meta: { to: tierId, by } })
    }
    await tx.update(users).set({ houseTier: findTier(tierId).id, homePlotId: null }).where(eq(users.id, userId))
    return { ok: true, fee }
  })
}

export type HustlePayResult = { ok: true; balance: number }

/**
 * Pay one completed hustle job (once per job id). No daily limits: energy,
 * food and each gig's pace are the brake (docs/economy-progress.md §18.1).
 * `meta` carries the receipt (gross, costs, tip) for the wallet history.
 * Safe to retry: a job that's already in the ledger reports ok again (a retry
 * after a lost reply must not look unpaid).
 */
export async function payHustle(
  input: {
    userId: string
    hustle: string
    jobId: string
    net: number
    meta: Record<string, unknown>
  },
  db: Database = getDatabase()
): Promise<HustlePayResult> {
  const reason = `hustle_${input.hustle}`
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const [already] = await tx
      .select({ id: coinLedger.id })
      .from(coinLedger)
      .where(and(eq(coinLedger.userId, input.userId), eq(coinLedger.reason, reason), eq(coinLedger.refId, input.jobId)))
      .limit(1)
    if (already) return { ok: true, balance: await balanceOf(tx, input.userId) }
    const inserted = await insertEntry(tx, {
      userId: input.userId,
      delta: Math.max(0, Math.round(input.net)),
      reason,
      refId: input.jobId,
      meta: input.meta
    })
    if (!inserted) throw new Error(`payHustle: ledger refused ${reason}/${input.jobId}`)
    return { ok: true, balance: await balanceOf(tx, input.userId) }
  })
}

export type BikeRentResult = { ok: true; charged: boolean; balance: number } | { ok: false; reason: "insufficient"; balance: number }

/**
 * Rent the stage bike for today (once per Kampala day). Returns charged=false
 * if today's rent was already paid. Refuses if the player can't afford it.
 */
export async function rentBikeToday(
  input: { userId: string; amount: number },
  db: Database = getDatabase()
): Promise<BikeRentResult> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const day = kampalaDay(new Date())
    const refId = `bike_rent:${day}`
    const [existing] = await tx
      .select({ id: coinLedger.id })
      .from(coinLedger)
      .where(and(eq(coinLedger.userId, input.userId), eq(coinLedger.reason, "bike_rent"), eq(coinLedger.refId, refId)))
      .limit(1)
    const balance = await balanceOf(tx, input.userId)
    if (existing) return { ok: true, charged: false, balance }
    if (balance < input.amount) return { ok: false, reason: "insufficient", balance }
    await insertEntry(tx, { userId: input.userId, delta: -input.amount, reason: "bike_rent", refId, meta: { day } })
    return { ok: true, charged: true, balance: balance - input.amount }
  })
}

/**
 * Charge fuel burned without a paid ride to cover it (e.g. at the end of a
 * shift). Takes what the player has, never more; once per `refId`.
 */
export async function chargeFuel(
  input: { userId: string; amount: number; refId: string },
  db: Database = getDatabase()
): Promise<number> {
  if (input.amount <= 0) return 0
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const charge = Math.min(Math.round(input.amount), await balanceOf(tx, input.userId))
    if (charge <= 0) return 0
    const inserted = await insertEntry(tx, { userId: input.userId, delta: -charge, reason: "fuel", refId: input.refId })
    return inserted ? charge : 0
  })
}
