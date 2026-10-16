import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm"
import {
  HOSTED_OPEN_BEFORE_MS,
  HOSTED_REMINDER_BEFORE_MS,
  PRIZE_MESSAGE_MAX,
  PRIZE_MIN_OTHER_RACERS,
  prizeProblem,
  splitPrize,
  type PrizeProblem
} from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, findNote, insertEntry, lockUser, type Tx } from "./ledger.js"
import { hostedRaceSignups, hostedRaces, lifeEvents, tiktokAccounts, users, type HostedRaceRow } from "./schema.js"

// Prize races. Money rules (cut, shares, who can win) live in
// @tiral/game-core/prizes; this module moves the coins:
//   prize_hold   −pot  when the host sets the prize (ref = race id)
//   prize_win    +     each winner (ref = race id; one per user per race)
//   prize_refund +     the pot, or the shares nobody claimed, back to the host
// Each step runs under a row lock on the race and checks its status first,
// so a retried or repeated call can't pay twice.

/** 5 characters: open races use 4, so a prize race code never collides with one. */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
function makeCode() {
  let code = ""
  for (let i = 0; i < 5; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]!
  return code
}

/** Printable, single-line, trimmed. */
function cleanMessage(message: string | null | undefined): string | null {
  const text = (message ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()
  return text ? text.slice(0, PRIZE_MESSAGE_MAX) : null
}

export type HostedRaceView = {
  id: string
  roomCode: string
  host: { id: string; name: string }
  pot: number
  shares: number[]
  message: string | null
  startsAt: string
  countdownSeconds: number
  status: string
  signups: number
  /** The viewer has said "I'm in". */
  signedUp: boolean
  /** The host's photo (our stored copy, or an older TikTok link that may have expired). */
  hostAvatarUrl?: string | null
}

async function hostName(executor: Database | Tx, userId: string) {
  const [row] = await executor.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).limit(1)
  return row?.name ?? "A racer"
}

function view(row: HostedRaceRow, host: string, signups = 0, signedUp = false): HostedRaceView {
  return {
    id: row.id,
    roomCode: row.roomCode,
    host: { id: row.hostUserId, name: host },
    pot: row.pot,
    shares: row.shares,
    message: row.message,
    startsAt: row.startsAt.toISOString(),
    countdownSeconds: row.countdownSeconds,
    status: row.status,
    signups,
    signedUp
  }
}

export type CreateHostedRaceResult =
  | { ok: true; race: HostedRaceView }
  | { ok: false; reason: "guest" | "insufficient" | PrizeProblem; balance?: number }

/** Schedule a prize race and hold the pot from the host's wallet. Only TikTok-linked players can host. */
export async function createHostedRace(
  input: { hostUserId: string; pot: number; shares: number[]; message?: string | null; startsAt: Date; countdownSeconds: number },
  db: Database = getDatabase()
): Promise<CreateHostedRaceResult> {
  const message = cleanMessage(input.message)
  const problem = prizeProblem({ ...input, message }, new Date())
  if (problem) return { ok: false, reason: problem }
  return db.transaction(async (tx) => {
    await lockUser(tx, input.hostUserId)
    const [linked] = await tx
      .select({ userId: tiktokAccounts.userId })
      .from(tiktokAccounts)
      .where(eq(tiktokAccounts.userId, input.hostUserId))
      .limit(1)
    if (!linked) return { ok: false, reason: "guest" }
    const balance = await balanceOf(tx, input.hostUserId)
    if (balance < input.pot) return { ok: false, reason: "insufficient", balance }

    let row: HostedRaceRow | undefined
    for (let attempt = 0; attempt < 20 && !row; attempt++) {
      ;[row] = await tx
        .insert(hostedRaces)
        .values({
          roomCode: makeCode(),
          hostUserId: input.hostUserId,
          pot: input.pot,
          shares: input.shares,
          message,
          startsAt: input.startsAt,
          countdownSeconds: input.countdownSeconds
        })
        .onConflictDoNothing({ target: hostedRaces.roomCode })
        .returning()
    }
    if (!row) throw new Error("createHostedRace: no free room code")
    await insertEntry(tx, {
      userId: input.hostUserId,
      delta: -input.pot,
      reason: "prize_hold",
      refId: row.id,
      meta: { code: row.roomCode, startsAt: row.startsAt.toISOString() }
    })
    return { ok: true, race: view(row, await hostName(tx, input.hostUserId)) }
  })
}

/** Give the pot back and close the race (status → refunded/cancelled). False if already settled. */
async function refundInTx(tx: Tx, row: HostedRaceRow, why: string, status: "refunded" | "cancelled") {
  await lockUser(tx, row.hostUserId)
  await insertEntry(tx, { userId: row.hostUserId, delta: row.pot, reason: "prize_refund", refId: row.id, meta: { why } })
  if (!(await findNote(tx, row.hostUserId, "prize_refund", row.id))) {
    await tx.insert(lifeEvents).values({
      userId: row.hostUserId,
      kind: "prize_refund",
      amount: row.pot,
      status: "info",
      meta: { ref: row.id, amount: row.pot, why }
    })
  }
  await tx
    .update(hostedRaces)
    .set({ status, settlement: { refund: row.pot, why }, settledAt: new Date() })
    .where(eq(hostedRaces.id, row.id))
}

async function lockRace(tx: Tx, id: string) {
  const rows = await tx.select().from(hostedRaces).where(eq(hostedRaces.id, id)).for("update").limit(1)
  return rows[0] ?? null
}

/** The host calls it off before the countdown: full refund, no cut. */
export async function cancelHostedRace(
  input: { hostUserId: string; id: string },
  db: Database = getDatabase()
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "not_host" | "started" }> {
  return db.transaction(async (tx) => {
    const row = await lockRace(tx, input.id)
    if (!row) return { ok: false, reason: "not_found" }
    if (row.hostUserId !== input.hostUserId) return { ok: false, reason: "not_host" }
    if (row.status !== "scheduled" || row.startsAt.getTime() <= Date.now()) return { ok: false, reason: "started" }
    await refundInTx(tx, row, "cancelled", "cancelled")
    return { ok: true }
  })
}

/** Refund a race that couldn't run (missed start, nobody came). False if already settled. */
export async function refundHostedRace(id: string, why: string, db: Database = getDatabase()): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = await lockRace(tx, id)
    if (!row || (row.status !== "scheduled" && row.status !== "live")) return false
    await refundInTx(tx, row, why, "refunded")
    return true
  })
}

/** Upcoming and running prize races for the hub, soonest first. */
export async function listHostedRaces(viewerUserId: string | null, db: Database = getDatabase()): Promise<HostedRaceView[]> {
  const rows = await db
    .select({
      race: hostedRaces,
      host: users.displayName,
      avatarUrl: users.avatarUrl,
      signups: sql<number>`(select count(*)::int from ${hostedRaceSignups} s where s.hosted_race_id = ${hostedRaces.id})`,
      signedUp: viewerUserId
        ? sql<boolean>`exists(select 1 from ${hostedRaceSignups} s where s.hosted_race_id = ${hostedRaces.id} and s.user_id = ${viewerUserId})`
        : sql<boolean>`false`
    })
    .from(hostedRaces)
    .innerJoin(users, eq(users.id, hostedRaces.hostUserId))
    .where(inArray(hostedRaces.status, ["scheduled", "live"]))
    .orderBy(asc(hostedRaces.startsAt))
    .limit(50)
  return rows.map((row) => ({ ...view(row.race, row.host, row.signups, row.signedUp), hostAvatarUrl: row.avatarUrl }))
}

/** One prize race (for the game server and invite links). */
export async function getHostedRace(id: string, db: Database = getDatabase()): Promise<HostedRaceView | null> {
  const [row] = await db.select().from(hostedRaces).where(eq(hostedRaces.id, id)).limit(1)
  return row ? view(row, await hostName(db, row.hostUserId)) : null
}

/** "I'm in" (or not) for an upcoming prize race. */
export async function setHostedRaceSignup(
  input: { userId: string; id: string; on: boolean },
  db: Database = getDatabase()
): Promise<boolean> {
  const [row] = await db.select({ status: hostedRaces.status }).from(hostedRaces).where(eq(hostedRaces.id, input.id)).limit(1)
  if (!row || row.status !== "scheduled") return false
  if (input.on) {
    await db.insert(hostedRaceSignups).values({ hostedRaceId: input.id, userId: input.userId }).onConflictDoNothing()
  } else {
    await db
      .delete(hostedRaceSignups)
      .where(and(eq(hostedRaceSignups.hostedRaceId, input.id), eq(hostedRaceSignups.userId, input.userId)))
  }
  return true
}

/**
 * Prize races the game server should have open now: scheduled ones starting
 * within the hour, plus anything still scheduled or live (to restore after a
 * restart, or to refund if it was missed).
 */
export async function dueHostedRaces(now = new Date(), db: Database = getDatabase()): Promise<HostedRaceRow[]> {
  return db
    .select()
    .from(hostedRaces)
    .where(
      and(
        inArray(hostedRaces.status, ["scheduled", "live"]),
        lte(hostedRaces.startsAt, new Date(now.getTime() + HOSTED_OPEN_BEFORE_MS))
      )
    )
    .orderBy(asc(hostedRaces.startsAt))
}

/** Status of one prize race (the room checks for a cancellation). */
export async function hostedRaceStatus(id: string, db: Database = getDatabase()): Promise<string | null> {
  const [row] = await db.select({ status: hostedRaces.status }).from(hostedRaces).where(eq(hostedRaces.id, id)).limit(1)
  return row?.status ?? null
}

/** The gun: scheduled → live. False if it was cancelled meanwhile (race on, no prize). */
export async function markHostedRaceLive(id: string, db: Database = getDatabase()): Promise<boolean> {
  const rows = await db
    .update(hostedRaces)
    .set({ status: "live" })
    .where(and(eq(hostedRaces.id, id), eq(hostedRaces.status, "scheduled")))
    .returning({ id: hostedRaces.id })
  return rows.length > 0
}

export type PrizeSettlement =
  | { kind: "paid"; payouts: Array<{ userId: string; place: number; amount: number }>; cut: number; unclaimed: number }
  | { kind: "refunded"; why: string; refund: number }

/**
 * Pay a finished prize race. `finishers` are user ids in finishing order
 * (signed-in only); `racers` every account that raced. The host can't win,
 * and fewer than 2 other accounts racing means a full refund.
 */
export async function settleHostedRace(
  input: { id: string; raceId: string | null; finishers: string[]; racers: string[] },
  db: Database = getDatabase()
): Promise<PrizeSettlement | null> {
  return db.transaction(async (tx) => {
    const row = await lockRace(tx, input.id)
    if (!row) return null
    if (row.status !== "live") {
      // Already settled (a retry): report what happened.
      const done = row.settlement as Record<string, unknown> | null
      if (row.status === "paid" && done) return { kind: "paid", payouts: done.payouts as never, cut: Number(done.cut), unclaimed: Number(done.unclaimed) }
      if (row.status === "refunded" && done) return { kind: "refunded", why: String(done.why), refund: Number(done.refund) }
      return null
    }
    const others = new Set(input.racers.filter((userId) => userId !== row.hostUserId))
    if (others.size < PRIZE_MIN_OTHER_RACERS) {
      await refundInTx(tx, row, "few_racers", "refunded")
      return { kind: "refunded", why: "few_racers", refund: row.pot }
    }
    const winners: string[] = []
    for (const userId of input.finishers) {
      if (userId !== row.hostUserId && !winners.includes(userId)) winners.push(userId)
      if (winners.length === row.shares.length) break
    }
    if (winners.length === 0) {
      await refundInTx(tx, row, "no_finishers", "refunded")
      return { kind: "refunded", why: "no_finishers", refund: row.pot }
    }

    const split = splitPrize(row.pot, row.shares, winners.length)
    const host = await hostName(tx, row.hostUserId)
    const payouts = winners.map((userId, index) => ({ userId, place: index + 1, amount: split.payouts[index]! }))
    for (const payout of payouts) {
      await insertEntry(tx, {
        userId: payout.userId,
        delta: payout.amount,
        reason: "prize_win",
        refId: row.id,
        meta: { place: payout.place, host, code: row.roomCode }
      })
      await tx.insert(lifeEvents).values({
        userId: payout.userId,
        kind: "prize_won",
        amount: payout.amount,
        status: "info",
        meta: { ref: row.id, place: payout.place, amount: payout.amount, host }
      })
    }
    if (split.unclaimed > 0) {
      await insertEntry(tx, {
        userId: row.hostUserId,
        delta: split.unclaimed,
        reason: "prize_refund",
        refId: row.id,
        meta: { why: "unclaimed" }
      })
    }
    const paid = payouts.reduce((sum, payout) => sum + payout.amount, 0)
    await tx.insert(lifeEvents).values({
      userId: row.hostUserId,
      kind: "prize_paid",
      amount: paid,
      status: "info",
      meta: { ref: row.id, paid, winners: payouts.length, cut: split.cut, unclaimed: split.unclaimed }
    })
    await tx
      .update(hostedRaces)
      .set({
        status: "paid",
        raceId: input.raceId,
        settlement: { payouts, cut: split.cut, unclaimed: split.unclaimed },
        settledAt: new Date()
      })
      .where(eq(hostedRaces.id, row.id))
    return { kind: "paid", payouts, cut: split.cut, unclaimed: split.unclaimed }
  })
}

/** Inbox reminders for "I'm in" players, shortly before the start. Returns how many were sent. */
export async function sendHostedRaceReminders(now = new Date(), db: Database = getDatabase()): Promise<number> {
  const due = await db
    .select({ race: hostedRaces, userId: hostedRaceSignups.userId, host: users.displayName })
    .from(hostedRaceSignups)
    .innerJoin(hostedRaces, eq(hostedRaces.id, hostedRaceSignups.hostedRaceId))
    .innerJoin(users, eq(users.id, hostedRaces.hostUserId))
    .where(
      and(
        eq(hostedRaces.status, "scheduled"),
        isNull(hostedRaceSignups.remindedAt),
        gte(hostedRaces.startsAt, now),
        lte(hostedRaces.startsAt, new Date(now.getTime() + HOSTED_REMINDER_BEFORE_MS))
      )
    )
  for (const { race, userId, host } of due) {
    await db.transaction(async (tx) => {
      const claimed = await tx
        .update(hostedRaceSignups)
        .set({ remindedAt: now })
        .where(
          and(
            eq(hostedRaceSignups.hostedRaceId, race.id),
            eq(hostedRaceSignups.userId, userId),
            isNull(hostedRaceSignups.remindedAt)
          )
        )
        .returning({ userId: hostedRaceSignups.userId })
      if (claimed.length === 0) return
      await tx.insert(lifeEvents).values({
        userId,
        kind: "race_reminder",
        status: "info",
        meta: { ref: race.id, host, startsAt: race.startsAt.toISOString(), pot: race.pot, code: race.roomCode }
      })
    })
  }
  return due.length
}

export type SharedPrizeRace = HostedRaceView & {
  hostAvatarUrl: string | null
  /** Once paid: who won what, by place. */
  winners: Array<{ place: number; amount: number; name: string }>
}

/** A prize race by its code (share images, link previews): public details only. */
export async function getSharedPrizeRace(code: string, db: Database = getDatabase()): Promise<SharedPrizeRace | null> {
  const [row] = await db
    .select({ race: hostedRaces, host: users.displayName, avatarUrl: users.avatarUrl })
    .from(hostedRaces)
    .innerJoin(users, eq(users.id, hostedRaces.hostUserId))
    .where(eq(hostedRaces.roomCode, code.trim().toUpperCase()))
    .limit(1)
  if (!row) return null
  const payouts = ((row.race.settlement as { payouts?: Array<{ userId: string; place: number; amount: number }> } | null)?.payouts ?? [])
  const names = payouts.length
    ? await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, payouts.map((payout) => payout.userId)))
    : []
  return {
    ...view(row.race, row.host),
    hostAvatarUrl: row.avatarUrl,
    winners: payouts.map((payout) => ({
      place: payout.place,
      amount: payout.amount,
      name: names.find((entry) => entry.id === payout.userId)?.name ?? "A racer"
    }))
  }
}
