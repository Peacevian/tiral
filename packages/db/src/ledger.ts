// Shared ledger primitives for modules that move coins (not exported from the package).
import { eq, sql } from "drizzle-orm"
import type { LedgerReason } from "@tiral/game-core"
import type { Database } from "./client.js"
import { coinLedger } from "./schema.js"

export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]
type Executor = Database | Tx

/** Serialise all money movements for one user within the current transaction. */
export async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`coins:${userId}`}))`)
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

