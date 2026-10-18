import { eq, sql } from "drizzle-orm"
import {
  ENERGY_REGEN_PER_HOUR,
  STRESSED_ENERGY_REGEN_FACTOR,
  STRESSED_THRESHOLD,
  STRESS_DECAY_PER_HOUR,
  STRESS_MAX,
  HEALTH_REGEN_PER_HOUR,
  NEED_MAX,
  RESTING_ENERGY_REGEN_PER_HOUR,
  RESTING_HEALTH_REGEN_PER_HOUR,
  currentNeeds,
  eat,
  findFood,
  type Needs
} from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, insertEntry, lockUser, lockUserRow, type Tx } from "./ledger.js"
import { users } from "./schema.js"

export type PlayerNeeds = Needs & { resting: boolean }

async function readStored(executor: Database | Tx, userId: string) {
  const rows = await executor
    .select({
      energy: users.energy,
      health: users.health,
      at: users.needsAt,
      restingSince: users.restingSince,
      stress: users.stress,
      restFactor: users.restFactor
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

export type NeedsDelta = { userId: string; energy: number; health: number; stress?: number }

/**
 * Apply energy/health *changes* (e.g. "-12 energy from sprinting") for many
 * players in one UPDATE, on top of whatever is stored plus time-based regen.
 * Writing deltas rather than totals means food bought mid-race and natural
 * refill are never overwritten. Racing wakes you. Returns each player's new
 * values. Same maths as currentNeeds(), done in SQL.
 */
export async function applyNeedsDeltas(
  deltas: NeedsDelta[],
  db: Database = getDatabase()
): Promise<Map<string, Needs>> {
  const result = new Map<string, Needs>()
  if (deltas.length === 0) return result
  const rows = sql.join(
    deltas.map((d) => sql`(${d.userId}::uuid, ${d.energy}::float8, ${d.health}::float8, ${d.stress ?? 0}::float8)`),
    sql`, `
  )
  // Numeric parameters are cast explicitly: Postgres can't infer them inside least()/greatest().
  const max = sql`${NEED_MAX}::float8`
  const hours = sql`greatest(0::float8, extract(epoch from (now() - u.needs_at))::float8 / 3600.0)`
  const regen = (stored: ReturnType<typeof sql>, awake: number, resting: number, factor = sql`1::float8`) =>
    sql`least(${max}, ${stored} + ${hours} * ${factor} * (case when u.resting_since is null then ${awake}::float8 else ${resting}::float8 end))`
  // Stressed players refill energy slower (judged on stress as stored).
  const stressedFactor = sql`(case when u.stress >= ${STRESSED_THRESHOLD}::float8 then ${STRESSED_ENERGY_REGEN_FACTOR}::float8 else 1::float8 end)`
  const stressHours = sql`greatest(0::float8, extract(epoch from (now() - u.stress_at))::float8 / 3600.0)`
  // Resting refills energy at the bed's rate (u.rest_factor); stress fades faster with a sofa or TV (u.calm_factor).
  const restedEnergy = sql`least(${max}, u.energy + ${hours} * ${stressedFactor} * (case when u.resting_since is null then ${ENERGY_REGEN_PER_HOUR}::float8 else ${RESTING_ENERGY_REGEN_PER_HOUR}::float8 * u.rest_factor end))`
  const updated = await db.execute<{ id: string; energy: number; health: number }>(sql`
    update users as u set
      energy = least(${max}, greatest(0::float8, ${restedEnergy} + d.energy)),
      health = least(${max}, greatest(0::float8, ${regen(sql`u.health`, HEALTH_REGEN_PER_HOUR, RESTING_HEALTH_REGEN_PER_HOUR)} + d.health)),
      needs_at = now(),
      resting_since = null,
      stress = least(${STRESS_MAX}::float8, greatest(0::float8, greatest(0::float8, u.stress - ${stressHours} * ${STRESS_DECAY_PER_HOUR}::float8 * u.calm_factor) + d.stress)),
      stress_at = now()
    from (values ${rows}) as d(id, energy, health, stress)
    where u.id = d.id
    returning u.id, u.energy, u.health
  `)
  for (const row of updated) {
    result.set(row.id, { energy: Number(row.energy), health: Number(row.health) })
  }
  return result
}

/** Lie down in your bed at home (fast healing) or get up again. */
export async function setResting(
  userId: string,
  resting: boolean,
  db: Database = getDatabase()
): Promise<PlayerNeeds> {
  return db.transaction(async (tx) => {
    // Read-modify-write of energy: hold the row so a delta from the game can't be lost.
    await lockUserRow(tx, userId)
    const now = new Date()
    const stored = await readStored(tx, userId)
    if (!stored) return { energy: NEED_MAX, health: NEED_MAX, resting: false }
    // Bank regen earned at the old rate before switching rates.
    const needs = currentNeeds(stored, now)
    await tx
      .update(users)
      .set({ ...needs, needsAt: now, restingSince: resting ? now : null })
      .where(eq(users.id, userId))
    return { ...needs, resting }
  })
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

    // Read-modify-write of energy: hold the row so a sprint's delta can't be lost.
    await lockUserRow(tx, input.userId)
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
