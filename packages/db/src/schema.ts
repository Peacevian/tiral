import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull()
})

export const tiktokAccounts = pgTable("tiktok_accounts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  openId: text("open_id").notNull().unique(),
  unionId: text("union_id"),
  scope: text("scope").default("").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type TiktokAccount = typeof tiktokAccounts.$inferSelect
