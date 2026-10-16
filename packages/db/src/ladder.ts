import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { LADDER, LADDER_START, NO_LADDER_PROGRESS, isGigUnlocked, type LadderCounts, type LadderGig } from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { findNote, lockUser } from "./ledger.js"
import { coinLedger, lifeEvents } from "./schema.js"

// The hustle ladder's progress is read from the coin ledger (every paid job is
// already there), counting only work done since LADDER_START.

const REASON_TO_COUNT: Record<string, keyof LadderCounts> = {
  hustle_porter: "porter",
  hustle_carwash: "carwash",
  hustle_boda: "boda",
  rolex_stock: "rolexShifts"
}

/** Jobs done towards the ladder. */
export async function ladderCounts(userId: string, db: Database = getDatabase()): Promise<LadderCounts> {
  const rows = await db
    .select({ reason: coinLedger.reason, count: sql<number>`count(*)::int` })
    .from(coinLedger)
    .where(
      and(
        eq(coinLedger.userId, userId),
        inArray(coinLedger.reason, Object.keys(REASON_TO_COUNT)),
        gte(coinLedger.createdAt, new Date(LADDER_START))
      )
    )
    .groupBy(coinLedger.reason)
  const counts = { ...NO_LADDER_PROGRESS }
  for (const row of rows) {
    const key = REASON_TO_COUNT[row.reason]
    if (key) counts[key] = row.count
  }
  return counts
}

/**
 * After a paid job: send an inbox note for each gig the player has just
 * unlocked (once per gig). Returns the gigs announced now.
 */
export async function announceLadderUnlocks(userId: string, db: Database = getDatabase()): Promise<LadderGig[]> {
  const counts = await ladderCounts(userId, db)
  const due = LADDER.filter((step) => step.requirement && !step.comingSoon && isGigUnlocked(step.gig, counts))
  if (due.length === 0) return []
  return db.transaction(async (tx) => {
    await lockUser(tx, userId)
    const announced: LadderGig[] = []
    for (const step of due) {
      const ref = `ladder:${step.gig}`
      if (await findNote(tx, userId, "ladder_unlock", ref)) continue
      await tx.insert(lifeEvents).values({
        userId,
        kind: "ladder_unlock",
        amount: 0,
        status: "info",
        meta: { ref, gig: step.gig, from: step.unlockedBy, text: step.unlockText }
      })
      announced.push(step.gig)
    }
    return announced
  })
}
