import { and, eq, gt, ne, sql } from "drizzle-orm"
import { findTierById } from "@tiral/game-core"
import { getDatabase, type Database } from "./client.js"
import { balanceOf } from "./ledger.js"
import { getTier } from "./livtok.js"
import { findPrivyOwner, hasPrivyAccount, hasTikTokLink } from "./users.js"
import { bikes, coinLedger, raceResults, tiktokAccounts, users } from "./schema.js"

// Guest → TikTok: a TikTok account belongs to one Tiral account. A guest that
// connects a new TikTok simply becomes that account. A TikTok that already has
// a played account never takes a guest's progress (the player is warned before
// the guest is left behind); one that never played moves onto the guest.

/** The Tiral account a TikTok login belongs to, if any. */
export async function findTikTokOwner(openId: string, db: Database = getDatabase()): Promise<string | null> {
  const [row] = await db.select({ userId: tiktokAccounts.userId }).from(tiktokAccounts).where(eq(tiktokAccounts.openId, openId)).limit(1)
  return row?.userId ?? null
}

export type AccountSummary = { userId: string; name: string; balance: number; tier: string; played: boolean }

/**
 * Who an account is and whether it has really played: earned anything beyond
 * the welcome money, raced, or owns a bike. (Rent alone doesn't count.)
 */
export async function accountSummary(userId: string, db: Database = getDatabase()): Promise<AccountSummary> {
  const [[user], balance, tier, [earned], [raced], [bike]] = await Promise.all([
    db.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).limit(1),
    balanceOf(db, userId),
    getTier(userId, db),
    db
      .select({ id: coinLedger.id })
      .from(coinLedger)
      .where(and(eq(coinLedger.userId, userId), gt(coinLedger.delta, 0), ne(coinLedger.reason, "welcome_grant")))
      .limit(1),
    db.select({ id: raceResults.id }).from(raceResults).where(eq(raceResults.userId, userId)).limit(1),
    db.select({ id: bikes.id }).from(bikes).where(eq(bikes.userId, userId)).limit(1)
  ])
  return { userId, name: user?.name ?? "Player", balance, tier: findTierById(tier).name, played: Boolean(earned || raced || bike) }
}

/**
 * Move a TikTok login onto another account (the TikTok's own account never
 * played): the guest keeps all its progress and takes the TikTok name and photo.
 */
export async function moveTikTokLink(
  input: {
    openId: string
    toUserId: string
    displayName: string
    avatarUrl: string | null
    unionId: string | null
    scope: string
    accessToken: string
    refreshToken: string
    expiresAt: Date
  },
  db: Database = getDatabase()
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(tiktokAccounts)
      .set({
        userId: input.toUserId,
        unionId: input.unionId,
        scope: input.scope,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        updatedAt: new Date()
      })
      .where(eq(tiktokAccounts.openId, input.openId))
    await tx
      .update(users)
      .set({ displayName: input.displayName, avatarUrl: input.avatarUrl, lastSeenAt: sql`now()` })
      .where(eq(users.id, input.toUserId))
  })
}

export type ConnectPlan =
  /** Sign in (or create) as usual; `guestUserId` is the guest to attach a new TikTok to. */
  | { kind: "link"; guestUserId: string | null }
  /** The TikTok's own account never played: move the login onto this guest. */
  | { kind: "move"; guestUserId: string }
  /** Both have progress: warn before the guest is left behind. */
  | { kind: "ask"; guest: AccountSummary; owner: AccountSummary }

/**
 * What to do when someone finishes TikTok sign-in. `startedBy` is whoever was
 * signed in when they began (a guest connecting TikTok, a TikTok player
 * switching accounts, or nobody).
 */
export async function planTikTokConnect(input: { startedBy: string | null; openId: string }, db: Database = getDatabase()): Promise<ConnectPlan> {
  const startedBy = input.startedBy
  // A TikTok player signing in with another TikTok: there's no guest to keep.
  const guestUserId = startedBy && !(await hasTikTokLink(startedBy, db)) ? startedBy : null
  const ownerUserId = await findTikTokOwner(input.openId, db)
  if (!guestUserId || !ownerUserId || ownerUserId === guestUserId) return { kind: "link", guestUserId }
  const [guest, owner] = await Promise.all([accountSummary(guestUserId, db), accountSummary(ownerUserId, db)])
  if (!guest.played) return { kind: "link", guestUserId: null }
  if (!owner.played) return { kind: "move", guestUserId }
  return { kind: "ask", guest, owner }
}

/**
 * What to do when someone finishes Privy sign-in. Same rules as TikTok: a new
 * login attaches to the account that started it, and a login that already has
 * a played account never takes that progress without a choice.
 */
export async function planPrivyConnect(
  input: { startedBy: string | null; privyUserId: string },
  db: Database = getDatabase()
): Promise<ConnectPlan> {
  const startedBy = input.startedBy
  const guestUserId = startedBy && !(await hasPrivyAccount(startedBy, db)) ? startedBy : null
  const ownerUserId = await findPrivyOwner(input.privyUserId, db)
  if (!guestUserId || !ownerUserId || ownerUserId === guestUserId) return { kind: "link", guestUserId }
  const [guest, owner] = await Promise.all([accountSummary(guestUserId, db), accountSummary(ownerUserId, db)])
  if (!guest.played) return { kind: "link", guestUserId: null }
  if (!owner.played) return { kind: "move", guestUserId }
  return { kind: "ask", guest, owner }
}
