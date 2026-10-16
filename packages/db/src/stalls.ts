import { KCCA_FINE, findRolexPack } from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, findNote, insertEntry, lockUser } from "./ledger.js"
import { lifeEvents } from "./schema.js"

export type StockResult =
  | { ok: true; rolexes: number; balance: number }
  | { ok: false; reason: "insufficient" | "duplicate" | "unknown_pack" }

/** Buy ingredients for a rolex shift (once per shift; no daily limit). */
export async function buyRolexStock(
  input: { userId: string; packId: string; shiftId: string; spot: string },
  db: Database = getDatabase()
): Promise<StockResult> {
  const pack = findRolexPack(input.packId)
  if (!pack) return { ok: false, reason: "unknown_pack" }
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    if (balance < pack.price) return { ok: false, reason: "insufficient" }
    const inserted = await insertEntry(tx, {
      userId: input.userId,
      delta: -pack.price,
      reason: "rolex_stock",
      refId: input.shiftId,
      meta: { pack: pack.id, rolexes: pack.rolexes, spot: input.spot }
    })
    if (!inserted) return { ok: false, reason: "duplicate" }
    return { ok: true, rolexes: pack.rolexes, balance: balance - pack.price }
  })
}

/** KCCA confiscated the stall: a fine (whatever you have, up to the full fine) and an inbox note. */
export async function chargeKccaFine(
  input: { userId: string; refId: string; spot: string },
  db: Database = getDatabase()
): Promise<number> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    // Retry-safe: this raid's note is written once, with the fine taken.
    const done = await findNote(tx, input.userId, "kcca_raid", input.refId)
    if (done) return done.amount
    const charge = Math.min(KCCA_FINE, await balanceOf(tx, input.userId))
    if (charge > 0) {
      await insertEntry(tx, { userId: input.userId, delta: -charge, reason: "kcca_fine", refId: input.refId, meta: { spot: input.spot } })
    }
    await tx.insert(lifeEvents).values({
      userId: input.userId,
      kind: "kcca_raid",
      amount: charge,
      status: "info",
      meta: { spot: input.spot, charged: charge, ref: input.refId }
    })
    return charge
  })
}
