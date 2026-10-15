// Shared ledger primitives for modules that move coins (not exported from the package).
import { and, eq, sql } from "drizzle-orm"
import type { LedgerReason } from "@tiral/game-core"
import type { Database } from "./client.js"
import { coinLedger, lifeEvents } from "./schema.js"

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]
type Executor = Database | Tx

/** Serialise all money movements for one user within the current transaction. */
export async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`coins:${userId}`}))`)
}

/**
 * Row-lock the player's users row for the rest of the transaction. Take it
 * before reading energy/health/stress that you'll write back: the game server
 * applies needs deltas without the coin lock, and its UPDATE then waits for
 * this transaction and lands on top of what it wrote instead of being lost.
 */
export async function lockUserRow(tx: Tx, userId: string) {
  await tx.execute(sql`select 1 from users where id = ${userId} for update`)
}

export async function balanceOf(executor: Executor, userId: string): Promise<number> {
  const rows = await executor
    .select({ balance: sql<string>`coalesce(sum(${coinLedger.delta}), 0)` })
    .from(coinLedger)
    .where(eq(coinLedger.userId, userId))
  return Number(rows[0]?.balance ?? 0)
}

/** Insert an entry unless that (user, reason, ref) already exists. Returns true if new. */
export async function insertEntry(
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


/** An inbox note of this kind already written for `ref` (makes charges with a note retry-safe). */
export async function findNote(tx: Tx, userId: string, kind: string, ref: string): Promise<{ amount: number } | null> {
  const [row] = await tx
    .select({ amount: lifeEvents.amount })
    .from(lifeEvents)
    .where(and(eq(lifeEvents.userId, userId), eq(lifeEvents.kind, kind), sql`${lifeEvents.meta} ->> 'ref' = ${ref}`))
    .limit(1)
  return row ?? null
}
