import { desc, eq } from "drizzle-orm"
import { kampalaDay } from "@tiral/game-core"
import { sanitizeLoadout, type AvatarLoadout } from "@tiral/avatars"
import { sanitizeHouseLoadout, type HouseLoadout } from "@tiral/houses"
import { getDatabase, type Database } from "./client.js"
import { privyAccounts, raceResults, races, tiktokAccounts, userActivityDays, users, type User } from "./schema.js"

export async function findUserById(id: string, db: Database = getDatabase()): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return rows[0] ?? null
}

export async function createGuest(displayName: string, db: Database = getDatabase()): Promise<User> {
  const rows = await db.insert(users).values({ displayName }).returning()
  const user = rows[0]
  if (!user) throw new Error("Failed to create guest user")
  return user
}

export async function touchLastSeen(id: string, db: Database = getDatabase()): Promise<void> {
  const now = new Date()
  await db.update(users).set({ lastSeenAt: now }).where(eq(users.id, id))
  // One row per player per Kampala day: what active players and retention
  // are counted from (admin stats). Second, so last_seen_at still lands if
  // the table is missing on a database that hasn't run migration 0014 yet.
  await db.insert(userActivityDays).values({ userId: id, day: kampalaDay(now) }).onConflictDoNothing()
}

export type TikTokUpsert = {
  openId: string
  unionId: string | null
  scope: string
  displayName: string
  avatarUrl: string | null
  accessToken: string
  refreshToken: string
  expiresAt: Date
}

export async function upsertTikTokAccount(
  input: TikTokUpsert,
  existingUserId?: string,
  db: Database = getDatabase()
): Promise<User> {
  const linked = await db
    .select({ user: users })
    .from(tiktokAccounts)
    .innerJoin(users, eq(users.id, tiktokAccounts.userId))
    .where(eq(tiktokAccounts.openId, input.openId))
    .limit(1)

  if (linked[0]) {
    const user = linked[0].user
    await db
      .update(tiktokAccounts)
      .set({
        unionId: input.unionId,
        scope: input.scope,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt,
        updatedAt: new Date()
      })
      .where(eq(tiktokAccounts.openId, input.openId))
    await db
      .update(users)
      .set({ displayName: input.displayName, avatarUrl: input.avatarUrl, lastSeenAt: new Date() })
      .where(eq(users.id, user.id))
    return { ...user, displayName: input.displayName, avatarUrl: input.avatarUrl }
  }

  if (existingUserId) {
    const guest = await findUserById(existingUserId, db)
    if (guest) {
      await db.insert(tiktokAccounts).values({
        userId: guest.id,
        openId: input.openId,
        unionId: input.unionId,
        scope: input.scope,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        expiresAt: input.expiresAt
      })
      await db
        .update(users)
        .set({ displayName: input.displayName, avatarUrl: input.avatarUrl, lastSeenAt: new Date() })
        .where(eq(users.id, guest.id))
      return { ...guest, displayName: input.displayName, avatarUrl: input.avatarUrl }
    }
  }

  const created = await db
    .insert(users)
    .values({ displayName: input.displayName, avatarUrl: input.avatarUrl })
    .returning()
  const user = created[0]
  if (!user) throw new Error("Failed to create TikTok user")
  await db.insert(tiktokAccounts).values({
    userId: user.id,
    openId: input.openId,
    unionId: input.unionId,
    scope: input.scope,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: input.expiresAt
  })
  return user
}

export async function hasTikTokLink(userId: string, db: Database = getDatabase()): Promise<boolean> {
  const rows = await db
    .select({ userId: tiktokAccounts.userId })
    .from(tiktokAccounts)
    .where(eq(tiktokAccounts.userId, userId))
    .limit(1)
  return rows.length > 0
}

const WALLET_ADDRESS = /^0x[a-f0-9]{40}$/

export function normalizeWalletAddress(value: string): string | null {
  const address = value.trim().toLowerCase()
  return WALLET_ADDRESS.test(address) ? address : null
}

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current: unknown = error
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current)
    if ("code" in current && (current as { code?: unknown }).code === "23505") return true
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined
  }
  return false
}

/** The Tiral account a Privy user already belongs to, if any. */
export async function findPrivyOwner(privyUserId: string, db: Database = getDatabase()): Promise<string | null> {
  const [row] = await db
    .select({ userId: privyAccounts.userId })
    .from(privyAccounts)
    .where(eq(privyAccounts.privyUserId, privyUserId))
    .limit(1)
  return row?.userId ?? null
}

export async function hasPrivyAccount(userId: string, db: Database = getDatabase()): Promise<boolean> {
  const rows = await db
    .select({ userId: privyAccounts.userId })
    .from(privyAccounts)
    .where(eq(privyAccounts.userId, userId))
    .limit(1)
  return rows.length > 0
}

export type PrivyAccountView = {
  walletAddress: string
  identityRoot: string | null
  identityExpiresAt: Date | null
  identityCheckedAt: Date | null
}

export async function findPrivyAccount(
  userId: string,
  db: Database = getDatabase()
): Promise<PrivyAccountView | null> {
  const [row] = await db
    .select({
      walletAddress: privyAccounts.walletAddress,
      identityRoot: privyAccounts.identityRoot,
      identityExpiresAt: privyAccounts.identityExpiresAt,
      identityCheckedAt: privyAccounts.identityCheckedAt
    })
    .from(privyAccounts)
    .where(eq(privyAccounts.userId, userId))
    .limit(1)
  return row ?? null
}

/** The Tiral account that already saved this GoodDollar person, if any. */
export async function findIdentityOwner(root: string, db: Database = getDatabase()): Promise<string | null> {
  const [row] = await db
    .select({ userId: privyAccounts.userId })
    .from(privyAccounts)
    .where(eq(privyAccounts.identityRoot, root))
    .limit(1)
  return row?.userId ?? null
}

/**
 * Remember a face check for this account. A root already saved on a different
 * account is refused and left where it is.
 */
export async function rememberIdentity(
  userId: string,
  input: { root: string; expiresAt: Date | null },
  db: Database = getDatabase()
): Promise<"saved" | "taken"> {
  const owner = await findIdentityOwner(input.root, db)
  if (owner && owner !== userId) return "taken"
  try {
    await db
      .update(privyAccounts)
      .set({
        identityRoot: input.root,
        identityExpiresAt: input.expiresAt,
        identityCheckedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(privyAccounts.userId, userId))
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    return "taken"
  }
  return "saved"
}

export async function clearIdentity(userId: string, db: Database = getDatabase()): Promise<void> {
  await db
    .update(privyAccounts)
    .set({
      identityRoot: null,
      identityExpiresAt: null,
      identityCheckedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(privyAccounts.userId, userId))
}

async function rememberWallet(db: Database, privyUserId: string, walletAddress: string): Promise<void> {
  try {
    await db
      .update(privyAccounts)
      .set({ walletAddress, updatedAt: new Date() })
      .where(eq(privyAccounts.privyUserId, privyUserId))
  } catch (error) {
    // Another account already holds this address: keep the one we stored.
    if (!isUniqueViolation(error)) throw error
  }
}

export type PrivyUpsert = {
  privyUserId: string
  walletAddress: string
  /** Used only when this login creates a new Tiral account. */
  displayName: string
}

/**
 * Sign a Privy user in. An existing login keeps its display name. A new login
 * attaches to `attachToUserId` when that account has no Privy row yet.
 */
export async function upsertPrivyAccount(
  input: PrivyUpsert,
  attachToUserId?: string | null,
  db: Database = getDatabase()
): Promise<User> {
  const linked = await db
    .select({ user: users })
    .from(privyAccounts)
    .innerJoin(users, eq(users.id, privyAccounts.userId))
    .where(eq(privyAccounts.privyUserId, input.privyUserId))
    .limit(1)

  if (linked[0]) {
    const user = linked[0].user
    await rememberWallet(db, input.privyUserId, input.walletAddress)
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id))
    return user
  }

  if (attachToUserId) {
    const guest = await findUserById(attachToUserId, db)
    if (guest && !(await hasPrivyAccount(guest.id, db))) {
      await db.insert(privyAccounts).values({
        userId: guest.id,
        privyUserId: input.privyUserId,
        walletAddress: input.walletAddress
      })
      await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, guest.id))
      return guest
    }
  }

  const created = await db.insert(users).values({ displayName: input.displayName }).returning()
  const user = created[0]
  if (!user) throw new Error("Failed to create user")
  await db.insert(privyAccounts).values({
    userId: user.id,
    privyUserId: input.privyUserId,
    walletAddress: input.walletAddress
  })
  return user
}

/** The Privy login's own account never played: move it onto the guest, and keep the guest's name. */
export async function movePrivyAccount(
  input: { privyUserId: string; toUserId: string; walletAddress: string },
  db: Database = getDatabase()
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(privyAccounts)
      .set({ userId: input.toUserId, updatedAt: new Date() })
      .where(eq(privyAccounts.privyUserId, input.privyUserId))
    await tx.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, input.toUserId))
  })
  await rememberWallet(db, input.privyUserId, input.walletAddress)
}

export async function updateGuestDisplayName(
  userId: string,
  displayName: string,
  db: Database = getDatabase()
): Promise<User | null> {
  const name = displayName.trim().slice(0, 24)
  if (name.length < 2) return null
  // A TikTok-only name stays until they sign in. Signing in makes the name theirs.
  if ((await hasTikTokLink(userId, db)) && !(await hasPrivyAccount(userId, db))) return null
  const rows = await db
    .update(users)
    .set({ displayName: name, lastSeenAt: new Date() })
    .where(eq(users.id, userId))
    .returning()
  return rows[0] ?? null
}

export async function updateAvatarLoadout(
  userId: string,
  loadout: unknown,
  db: Database = getDatabase()
): Promise<AvatarLoadout | null> {
  const clean = sanitizeLoadout(loadout)
  const rows = await db
    .update(users)
    .set({ avatarLoadout: clean, lastSeenAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ avatarLoadout: users.avatarLoadout })
  return rows[0]?.avatarLoadout ?? null
}

export async function updateHouseLoadout(
  userId: string,
  house: unknown,
  db: Database = getDatabase()
): Promise<HouseLoadout | null> {
  const clean = sanitizeHouseLoadout(house)
  const rows = await db
    .update(users)
    .set({ houseLoadout: clean, lastSeenAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ houseLoadout: users.houseLoadout })
  return rows[0]?.houseLoadout ?? null
}

export type ProfileStats = {
  races: number
  wins: number
  podiums: number
  points: number
  bestPosition: number | null
}

export async function getProfileStats(
  userId: string,
  db: Database = getDatabase()
): Promise<ProfileStats> {
  const rows = await db
    .select({ position: raceResults.position })
    .from(raceResults)
    .where(eq(raceResults.userId, userId))
  let points = 0
  let wins = 0
  let podiums = 0
  let bestPosition: number | null = null
  for (const row of rows) {
    if (row.position === 1) {
      points += 3
      wins += 1
    } else if (row.position === 2) {
      points += 2
    } else if (row.position === 3) {
      points += 1
    }
    if (row.position <= 3) podiums += 1
    if (bestPosition === null || row.position < bestPosition) bestPosition = row.position
  }
  return { races: rows.length, wins, podiums, points, bestPosition }
}

export type RecentRace = {
  raceId: string
  destinationId: string
  position: number
  playerCount: number
  finishedAt: Date
}

export async function getRecentRaces(
  userId: string,
  limit = 10,
  db: Database = getDatabase()
): Promise<RecentRace[]> {
  const rows = await db
    .select({
      raceId: raceResults.raceId,
      destinationId: races.destinationId,
      position: raceResults.position,
      playerCount: races.playerCount,
      finishedAt: raceResults.finishedAt
    })
    .from(raceResults)
    .innerJoin(races, eq(races.id, raceResults.raceId))
    .where(eq(raceResults.userId, userId))
    .orderBy(desc(raceResults.finishedAt))
    .limit(limit)
  return rows
}

/** A player's stored TikTok tokens (to refresh their profile photo), or null if not linked. */
export async function getTikTokTokens(
  userId: string,
  db: Database = getDatabase()
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date } | null> {
  const [row] = await db
    .select({ accessToken: tiktokAccounts.accessToken, refreshToken: tiktokAccounts.refreshToken, expiresAt: tiktokAccounts.expiresAt })
    .from(tiktokAccounts)
    .where(eq(tiktokAccounts.userId, userId))
    .limit(1)
  return row ?? null
}

export async function saveTikTokTokens(
  userId: string,
  tokens: { accessToken: string; refreshToken: string; expiresAt: Date },
  db: Database = getDatabase()
): Promise<void> {
  await db.update(tiktokAccounts).set({ ...tokens, updatedAt: new Date() }).where(eq(tiktokAccounts.userId, userId))
}

/** Point the player's photo at our own stored copy (TikTok's own links expire within days). */
export async function setAvatarUrl(userId: string, avatarUrl: string | null, db: Database = getDatabase()): Promise<void> {
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId))
}
