import { eq, sql } from "drizzle-orm"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, insertEntry, lockUser } from "./ledger.js"
import { privyAccounts, users } from "./schema.js"

// Hangouts (docs/kyadondo.md): the ride there and orders at the counters are
// paid through the ledger (venue_ride, venue_order), once per refId.

export async function payVenue(
  input: { userId: string; reason: "venue_ride" | "venue_order"; refId: string; amount: number; meta: Record<string, unknown> },
  db: Database = getDatabase()
): Promise<{ ok: true; balance: number } | { ok: false; reason: "insufficient"; balance: number }> {
  const amount = Math.max(0, Math.round(input.amount))
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    if (balance < amount) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, { userId: input.userId, delta: -amount, reason: input.reason, refId: input.refId, meta: input.meta })
    return { ok: true, balance: inserted ? balance - amount : balance }
  })
}

/** Followers for treating people (signed-in players only, like LivTok). */
export async function addFollowers(userId: string, count: number, db: Database = getDatabase()): Promise<void> {
  if (count <= 0) return
  const [linked] = await db.select({ userId: privyAccounts.userId }).from(privyAccounts).where(eq(privyAccounts.userId, userId)).limit(1)
  if (!linked) return
  await db.update(users).set({ followers: sql`${users.followers} + ${Math.round(count)}` }).where(eq(users.id, userId))
}
