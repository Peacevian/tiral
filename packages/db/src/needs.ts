import { eq } from "drizzle-orm"
import { NEED_MAX, currentNeeds, eat, findFood, type Needs } from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, insertEntry, lockUser, type Tx } from "./ledger.js"
import { users } from "./schema.js"

export type PlayerNeeds = Needs & { resting: boolean }

async function readStored(executor: Database | Tx, userId: string) {
  const rows = await executor
    .select({
      energy: users.energy,
      health: users.health,
      at: users.needsAt,
      restingSince: users.restingSince
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return rows[0] ?? null
}

/** Energy/health right now (stored values plus regen since they were written). */
export async function loadNeeds(userId: string, db: Database = getDatabase()): Promise<PlayerNeeds> {
  const stored = await readStored(db, userId)
  if (!stored) return { energy: NEED_MAX, health: NEED_MAX, resting: false }
  return { ...currentNeeds(stored, new Date()), resting: stored.restingSince !== null }
}

/** Write needs after a race. Racing wakes you up. */
export async function saveNeeds(userId: string, needs: Needs, db: Database = getDatabase()): Promise<void> {
  await db
    .update(users)
    .set({ energy: needs.energy, health: needs.health, needsAt: new Date(), restingSince: null })
    .where(eq(users.id, userId))
}

/** Lie down in your bed at home (fast healing) or get up again. */
export async function setResting(
  userId: string,
  resting: boolean,
  db: Database = getDatabase()
): Promise<PlayerNeeds> {
  const now = new Date()
  const stored = await readStored(db, userId)
  if (!stored) return { energy: NEED_MAX, health: NEED_MAX, resting: false }
  // Bank regen earned at the old rate before switching rates.
  const needs = currentNeeds(stored, now)
  await db
    .update(users)
    .set({ ...needs, needsAt: now, restingSince: resting ? now : null })
    .where(eq(users.id, userId))
  return { ...needs, resting }
}

export type EatResult =
  | { ok: true; needs: PlayerNeeds; balance: number }
  | { ok: false; reason: "unknown_food" | "insufficient" | "duplicate"; balance: number }

/**
 * Buy and eat street food in one atomic step: the coins and the energy move
 * together or not at all. `purchaseId` makes retries safe (one charge per id).
 */
export async function eatFood(
  input: { userId: string; foodId: string; purchaseId: string },
  db: Database = getDatabase()
): Promise<EatResult> {
  const food = findFood(input.foodId)
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    if (!food) return { ok: false, reason: "unknown_food", balance }
    if (balance < food.price) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, {
      userId: input.userId,
      delta: -food.price,
      reason: "food",
      refId: input.purchaseId,
      meta: { food: food.id }
    })
    if (!inserted) return { ok: false, reason: "duplicate", balance }

    const now = new Date()
    const stored = await readStored(tx, input.userId)
    const before = stored ? currentNeeds(stored, now) : { energy: NEED_MAX, health: NEED_MAX }
    const after = eat(before, food.id)
    await tx
      .update(users)
      .set({ energy: after.energy, health: after.health, needsAt: now })
      .where(eq(users.id, input.userId))
    return {
      ok: true,
      needs: { ...after, resting: stored?.restingSince != null },
      balance: balance - food.price
    }
  })
}
