import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"
import {
  RACE_EARNING_REASONS,
  WELCOME_GRANT,
  computeRaceEarnings,
  kampalaDay,
  kampalaDayStart,
  shiftDay,
  streakDaysIncludingToday,
  type Earning,
  type LedgerReason
} from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { coinLedger, type CoinLedgerEntry } from "./schema.js"

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]
type Executor = Database | Tx

/** Serialise all money movements for one user within the current transaction. */
async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`coins:${userId}`}))`)
}

async function balanceOf(executor: Executor, userId: string): Promise<number> {
  const rows = await executor
    .select({ balance: sql<string>`coalesce(sum(${coinLedger.delta}), 0)` })
    .from(coinLedger)
    .where(eq(coinLedger.userId, userId))
  return Number(rows[0]?.balance ?? 0)
}

/** Insert an entry unless that (user, reason, ref) already exists. Returns true if new. */
async function insertEntry(
  executor: Executor,
  entry: { userId: string; delta: number; reason: LedgerReason | string; refId: string; meta?: Record<string, unknown> }
): Promise<boolean> {
  const rows = await executor
    .insert(coinLedger)
    .values(entry)
    .onConflictDoNothing({ target: [coinLedger.userId, coinLedger.reason, coinLedger.refId] })
    .returning({ id: coinLedger.id })
  return rows.length > 0
}

/** Everyone gets the arrival money once ("you arrive with 10k"). Safe to call often. */
export async function ensureWelcomeGrant(userId: string, db: Database = getDatabase()): Promise<void> {
  await insertEntry(db, { userId, delta: WELCOME_GRANT, reason: "welcome_grant", refId: "welcome" })
}

export async function getCoinBalance(userId: string, db: Database = getDatabase()): Promise<number> {
  return balanceOf(db, userId)
}

export async function listCoinLedger(
  userId: string,
  limit = 30,
  db: Database = getDatabase()
): Promise<CoinLedgerEntry[]> {
  return db
    .select()
    .from(coinLedger)
    .where(eq(coinLedger.userId, userId))
    .orderBy(desc(coinLedger.createdAt))
    .limit(limit)
}

export type SpendResult = { ok: true; balance: number } | { ok: false; reason: "insufficient" | "duplicate"; balance: number }

/** Spend atomically; never lets a balance go below zero. */
export async function spendCoins(
  input: { userId: string; amount: number; reason: string; refId: string; meta?: Record<string, unknown> },
  db: Database = getDatabase()
): Promise<SpendResult> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("amount must be a positive integer")
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    if (balance < input.amount) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, {
      userId: input.userId,
      delta: -input.amount,
      reason: input.reason,
      refId: input.refId,
      meta: input.meta
    })
    if (!inserted) return { ok: false, reason: "duplicate", balance }
    return { ok: true, balance: balance - input.amount }
  })
}

export type RacePayout = { userId: string; position: number; earnings: Earning[] }

/**
 * Pay every signed-in finisher of a recorded race. Idempotent per race: the
 * ledger's unique (user, reason, ref) means a retry can't pay twice.
 */
export async function awardRaceEarnings(
  input: {
    raceId: string
    finishedAt: Date
    fieldSize: number
    placements: Array<{ userId: string | null; position: number }>
  },
  db: Database = getDatabase()
): Promise<RacePayout[]> {
  const today = kampalaDay(input.finishedAt)
  const dayStart = kampalaDayStart(today)
  const streakWindowStart = kampalaDayStart(shiftDay(today, -8))
  const payouts: RacePayout[] = []

  for (const placement of input.placements) {
    const userId = placement.userId
    if (!userId) continue
    const earnings = await db.transaction(async (tx) => {
      await lockUser(tx, userId)
      await insertEntry(tx, { userId, delta: WELCOME_GRANT, reason: "welcome_grant", refId: "welcome" })

      const todayRows = await tx
        .select({ reason: coinLedger.reason, delta: coinLedger.delta, refId: coinLedger.refId })
        .from(coinLedger)
        .where(
          and(
            eq(coinLedger.userId, userId),
            inArray(coinLedger.reason, [...RACE_EARNING_REASONS]),
            gte(coinLedger.createdAt, dayStart)
          )
        )
      // Retrying the same race must not count its own rows as "already earned".
      const earlierToday = todayRows.filter((row) => row.refId !== input.raceId)
      const earnedToday = earlierToday.reduce((sum, row) => sum + row.delta, 0)
      const wonToday = earlierToday.some((row) => row.reason === "first_win_of_day")
      const firstFinishToday = !earlierToday.some((row) => row.reason === "race_finish")

      const recentFinishes = await tx
        .select({ createdAt: coinLedger.createdAt })
        .from(coinLedger)
        .where(
          and(
            eq(coinLedger.userId, userId),
            eq(coinLedger.reason, "race_finish"),
            gte(coinLedger.createdAt, streakWindowStart)
          )
        )
      const streakDays = streakDaysIncludingToday(
        today,
        recentFinishes.map((row) => kampalaDay(row.createdAt))
      )

      const earned = computeRaceEarnings({
        position: placement.position,
        fieldSize: input.fieldSize,
        earnedToday,
        wonToday,
        firstFinishToday,
        streakDays
      })
      const paid: Earning[] = []
      for (const earning of earned) {
        // Race-scoped rewards key on the race; once-a-day rewards key on the day.
        const refId =
          earning.reason === "first_win_of_day" || earning.reason === "race_streak" ? today : input.raceId
        const inserted = await insertEntry(tx, {
          userId,
          delta: earning.amount,
          reason: earning.reason,
          refId,
          meta: { raceId: input.raceId, position: placement.position, fieldSize: input.fieldSize }
        })
        if (inserted) paid.push(earning)
      }
      return paid
    })
    payouts.push({ userId, position: placement.position, earnings })
  }
  return payouts
}
