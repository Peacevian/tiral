import { and, eq, sql } from "drizzle-orm"
import {
  LIVE_GRADES,
  STARTING_FOLLOWERS,
  TIERS,
  findBale,
  findTierById,
  isGigUnlocked,
  type GradeCounts,
  type LiveGrade,
  type TierId
} from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { balanceOf, findNote, insertEntry, lockUser, type Tx } from "./ledger.js"
import { ladderCounts } from "./ladder.js"
import { coinLedger, lifeEvents, livtokStock, tiktokAccounts, users } from "./schema.js"

// Career tiers and LivTok, the first small business (docs/career-roadmap.md
// Phase 3a). Your tier is the coin ledger's "tier_up" entries (the capital put
// into your first business); LivTok stock and followers have their own rows.

/** The highest tier the player has moved up to. */
export async function getTier(userId: string, db: Database | Tx = getDatabase()): Promise<TierId> {
  const rows = await db
    .select({ ref: coinLedger.refId })
    .from(coinLedger)
    .where(and(eq(coinLedger.userId, userId), eq(coinLedger.reason, "tier_up")))
  let best = 0
  for (const row of rows) best = Math.max(best, TIERS.findIndex((tier) => tier.id === row.ref))
  return TIERS[best]!.id
}

export type LivtokStock = Record<string, GradeCounts>

/** Unsold pieces by bale and grade, and followers. */
export async function getLivtok(userId: string, db: Database | Tx = getDatabase()): Promise<{ stock: LivtokStock; followers: number }> {
  const [rows, [user]] = await Promise.all([
    db.select().from(livtokStock).where(eq(livtokStock.userId, userId)),
    db.select({ followers: users.followers }).from(users).where(eq(users.id, userId)).limit(1)
  ])
  const stock: LivtokStock = {}
  for (const row of rows) {
    if (row.count <= 0) continue
    stock[row.bale] ??= { first: 0, second: 0, third: 0 }
    stock[row.bale]![row.grade as LiveGrade] = row.count
  }
  return { stock, followers: user?.followers ?? 0 }
}

async function addStock(tx: Tx, userId: string, bale: string, counts: Partial<GradeCounts>) {
  for (const grade of LIVE_GRADES) {
    const add = Math.round(counts[grade] ?? 0)
    if (add === 0) continue
    await tx
      .insert(livtokStock)
      .values({ userId, bale, grade, count: Math.max(0, add) })
      .onConflictDoUpdate({
        target: [livtokStock.userId, livtokStock.bale, livtokStock.grade],
        set: { count: sql`greatest(0, ${livtokStock.count} + ${add})`, updatedAt: new Date() }
      })
  }
}

export type MoveUpResult =
  | { ok: true; tier: TierId; balance: number }
  | { ok: false; reason: "already" | "experience" | "tiktok" | "capital"; balance: number }

/**
 * Move up to Small business: needs 5 rolex shifts (the ladder), TikTok
 * connected and 500,000 saved; 150,000 of it becomes your first bale (opened
 * here, `counts` rolled by the caller), and you start with some followers.
 */
export async function moveUpToSmallBusiness(userId: string, counts: GradeCounts, db: Database = getDatabase()): Promise<MoveUpResult> {
  const small = findTierById("small")
  const [ladder, linked] = await Promise.all([
    ladderCounts(userId, db),
    db.select({ userId: tiktokAccounts.userId }).from(tiktokAccounts).where(eq(tiktokAccounts.userId, userId)).limit(1)
  ])
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    const balance = await balanceOf(tx, userId)
    if ((await getTier(userId, tx)) !== "street") return { ok: false, reason: "already", balance }
    if (!isGigUnlocked("live", ladder)) return { ok: false, reason: "experience", balance }
    if (linked.length === 0) return { ok: false, reason: "tiktok", balance }
    if (balance < small.capital) return { ok: false, reason: "capital", balance }
    const inserted = await insertEntry(tx, {
      userId,
      delta: -small.invest,
      reason: "tier_up",
      refId: "small",
      meta: { tier: "small", bale: "tops", counts }
    })
    if (!inserted) return { ok: false, reason: "already", balance }
    await addStock(tx, userId, "tops", counts)
    await tx.update(users).set({ followers: sql`greatest(${users.followers}, ${STARTING_FOLLOWERS})` }).where(eq(users.id, userId))
    if (!(await findNote(tx, userId, "tier_up", "small"))) {
      await tx.insert(lifeEvents).values({
        userId,
        kind: "tier_up",
        amount: small.invest,
        status: "info",
        meta: { ref: "small", tier: small.name }
      })
    }
    return { ok: true, tier: "small", balance: balance - small.invest }
  })
}

export type BuyBaleResult = { ok: true; counts: GradeCounts; balance: number } | { ok: false; reason: "insufficient" | "unknown"; balance: number }

/** Buy a bale at Owino (once per `refId`); its pieces join your stock. */
export async function buyBale(
  input: { userId: string; baleId: string; refId: string; counts: GradeCounts },
  db: Database = getDatabase()
): Promise<BuyBaleResult> {
  const bale = findBale(input.baleId)
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const balance = await balanceOf(tx, input.userId)
    if (!bale) return { ok: false, reason: "unknown", balance }
    if (balance < bale.price) return { ok: false, reason: "insufficient", balance }
    const inserted = await insertEntry(tx, {
      userId: input.userId,
      delta: -bale.price,
      reason: "livtok_bale",
      refId: input.refId,
      meta: { bale: bale.id, counts: input.counts }
    })
    if (inserted) await addStock(tx, input.userId, bale.id, input.counts)
    return { ok: true, counts: input.counts, balance: inserted ? balance - bale.price : balance }
  })
}

export type LiveSettlement = {
  userId: string
  liveId: string
  /** Pieces that left your stock (paid orders). Unpaid ones never left. */
  sold: ReadonlyArray<{ bale: string; grade: LiveGrade }>
  net: number
  followerDelta: number
  meta: Record<string, unknown>
}

/**
 * After a live: pay the paid orders (once per live), take those pieces out of
 * stock, and move followers (TikTok-connected sellers only).
 */
export async function settleLive(input: LiveSettlement, db: Database = getDatabase()): Promise<{ balance: number; followers: number }> {
  return db.transaction(async (tx) => {
    await lockUser(tx, input.userId)
    const inserted = await insertEntry(tx, {
      userId: input.userId,
      delta: Math.max(0, Math.round(input.net)),
      reason: "livtok_sales",
      refId: input.liveId,
      meta: input.meta
    })
    if (inserted) {
      const byBale = new Map<string, Partial<GradeCounts>>()
      for (const piece of input.sold) {
        const counts = byBale.get(piece.bale) ?? {}
        counts[piece.grade] = (counts[piece.grade] ?? 0) - 1
        byBale.set(piece.bale, counts)
      }
      for (const [bale, counts] of byBale) await addStock(tx, input.userId, bale, counts)
      const [linked] = await tx.select({ userId: tiktokAccounts.userId }).from(tiktokAccounts).where(eq(tiktokAccounts.userId, input.userId)).limit(1)
      if (linked && input.followerDelta !== 0) {
        await tx
          .update(users)
          .set({ followers: sql`greatest(0, ${users.followers} + ${Math.round(input.followerDelta)})` })
          .where(eq(users.id, input.userId))
      }
    }
    const [user] = await tx.select({ followers: users.followers }).from(users).where(eq(users.id, input.userId)).limit(1)
    return { balance: await balanceOf(tx, input.userId), followers: user?.followers ?? 0 }
  })
}

/** Tier and followers, for the app shell. */
export async function getCareer(userId: string, db: Database = getDatabase()): Promise<{ tier: TierId; followers: number }> {
  const [tier, [user]] = await Promise.all([
    getTier(userId, db),
    db.select({ followers: users.followers }).from(users).where(eq(users.id, userId)).limit(1)
  ])
  return { tier, followers: user?.followers ?? 0 }
}
