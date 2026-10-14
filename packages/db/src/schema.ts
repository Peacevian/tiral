import { doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import { DEFAULT_LOADOUT, type AvatarLoadout } from "@tiral/avatars"
import { DEFAULT_HOUSE, type HouseLoadout } from "@tiral/houses"

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  avatarLoadout: jsonb("avatar_loadout").$type<AvatarLoadout>().default(DEFAULT_LOADOUT).notNull(),
  houseLoadout: jsonb("house_loadout").$type<HouseLoadout>().default(DEFAULT_HOUSE).notNull(),
  // Energy/health as last written; current values add time-based regen
  // (see currentNeeds in @tiral/game-core). resting_since is set while asleep at home.
  energy: doublePrecision("energy").default(100).notNull(),
  health: doublePrecision("health").default(100).notNull(),
  needsAt: timestamp("needs_at", { withTimezone: true }).defaultNow().notNull(),
  restingSince: timestamp("resting_since", { withTimezone: true }),
  // Kampala Hustle life: where you live, when rent is due, how stressed you are.
  houseTier: text("house_tier").default("kisenyi").notNull(),
  rentDueAt: timestamp("rent_due_at", { withTimezone: true }),
  stress: doublePrecision("stress").default(20).notNull(),
  stressAt: timestamp("stress_at", { withTimezone: true }).defaultNow().notNull(),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }),
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

// Banange Coins ledger: append-only, balances are always SUM(delta).
// (user_id, reason, ref_id) is unique so any one event can only pay once,
// e.g. ("race_finish", <race id>) or ("first_win_of_day", "2026-10-14").
export const coinLedger = pgTable(
  "coin_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    refId: text("ref_id").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("coin_ledger_event_unique").on(table.userId, table.reason, table.refId),
    index("coin_ledger_user_created_idx").on(table.userId, table.createdAt)
  ]
)

export type CoinLedgerEntry = typeof coinLedger.$inferSelect

// Family requests, shocks and rent notices shown in the player's inbox.
// status: pending (request awaiting a choice) | paid | refused | expired | info
export const lifeEvents = pgTable(
  "life_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    amount: integer("amount").default(0).notNull(),
    status: text("status").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true })
  },
  (table) => [index("life_events_user_created_idx").on(table.userId, table.createdAt)]
)

export type LifeEventRow = typeof lifeEvents.$inferSelect
