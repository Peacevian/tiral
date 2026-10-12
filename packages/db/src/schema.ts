import { doublePrecision, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"
import { DEFAULT_HOUSE, type HouseLoadout } from "@tiral/houses"

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  avatarLoadout: jsonb("avatar_loadout").$type<AvatarLoadout>().default(DEFAULT_LOADOUT).notNull(),
  houseLoadout: jsonb("house_loadout").$type<HouseLoadout>().default(DEFAULT_HOUSE).notNull(),
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

export const races = pgTable("races", {
  id: uuid("id").primaryKey().defaultRandom(),
  roomCode: text("room_code").notNull(),
  destinationId: text("destination_id").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  playerCount: integer("player_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
})

export const raceResults = pgTable("race_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  raceId: uuid("race_id")
    .notNull()
    .references(() => races.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  position: integer("position").notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull()
})

export type Race = typeof races.$inferSelect
export type RaceResult = typeof raceResults.$inferSelect

export const billboardSlots = pgTable("billboard_slots", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  tier: text("tier").default("standard").notNull()
})

export const billboardCampaigns = pgTable("billboard_campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandName: text("brand_name").notNull(),
  imagePath: text("image_path").notNull(),
  link: text("link").notNull(),
  slotIds: text("slot_ids").array().notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").default("pending").notNull(),
  amountUgx: integer("amount_ugx").notNull(),
  buyerMsisdn: text("buyer_msisdn"),
  relworxReference: text("relworx_reference").unique(),
  relworxInternalRef: text("relworx_internal_ref"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
})

export const billboardImpressions = pgTable("billboard_impressions", {
  id: uuid("id").primaryKey().defaultRandom(),
  raceId: uuid("race_id").references(() => races.id, { onDelete: "cascade" }),
  slotId: text("slot_id").notNull(),
  campaignId: uuid("campaign_id").references(() => billboardCampaigns.id, {
    onDelete: "cascade"
  }),
  viewerCount: integer("viewer_count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull()
})

export type BillboardSlot = typeof billboardSlots.$inferSelect
export type BillboardCampaign = typeof billboardCampaigns.$inferSelect
