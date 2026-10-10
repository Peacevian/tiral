import { eq } from "drizzle-orm"
import { getDatabase, type Database } from "./client.js"
import { tiktokAccounts, users, type User } from "./schema.js"

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
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, id))
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
