import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"
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
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  // LivTok followers (TikTok-connected sellers only; docs/career-roadmap.md 3a).
  followers: integer("followers").default(0).notNull()
},
  // Sign-ups and recently seen players by day (admin stats).
  (table) => [index("users_created_idx").on(table.createdAt), index("users_last_seen_idx").on(table.lastSeenAt)]
)

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
},
  // Races per day (admin stats).
  (table) => [index("races_finished_idx").on(table.finishedAt)]
)

export const raceResults = pgTable("race_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  raceId: uuid("race_id")
    .notNull()
    .references(() => races.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  position: integer("position").notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull()
},
  // Leaderboard (by period) and profile stats/recent races (by player).
  (table) => [
    index("race_results_user_finished_idx").on(table.userId, table.finishedAt),
    index("race_results_finished_idx").on(table.finishedAt)
  ]
)

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
      .references(() => users.id, { onDelete: "restrict" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    refId: text("ref_id").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("coin_ledger_event_unique").on(table.userId, table.reason, table.refId),
    index("coin_ledger_user_created_idx").on(table.userId, table.createdAt),
    // Minted/burned per day and per reason (admin stats).
    index("coin_ledger_created_idx").on(table.createdAt),
    index("coin_ledger_reason_created_idx").on(table.reason, table.createdAt)
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

// Bikes a player owns or is leasing (the stage rental has no row).
// status: owned | leasing | repossessed. One active bike is the one you ride.
export const bikes = pgTable(
  "bikes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    status: text("status").notNull(),
    active: boolean("active").default(false).notNull(),
    /** Decorations (BikeLook from @tiral/game-core). */
    look: jsonb("look").$type<Record<string, unknown>>(),
    /** 0–100: raises breakdown odds; a service resets it. */
    wear: doublePrecision("wear").default(0).notNull(),
    leaseWeekly: integer("lease_weekly"),
    leaseWeeksTotal: integer("lease_weeks_total"),
    leaseWeeksPaid: integer("lease_weeks_paid").default(0).notNull(),
    leaseDueAt: timestamp("lease_due_at", { withTimezone: true }),
    /** Set when a lease payment was missed; repossessed after the grace period. */
    leaseMissedAt: timestamp("lease_missed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [index("bikes_user_idx").on(table.userId)]
)

export type BikeRow = typeof bikes.$inferSelect

// Bike decorations a player has bought (usable on any of their bikes).
export const bikeItems = pgTable(
  "bike_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [uniqueIndex("bike_items_user_item_idx").on(table.userId, table.itemId)]
)

// Prize races: scheduled races a TikTok-linked host funds with a BNG pot.
// status: scheduled (pot held, room not raced yet) | live (racing) |
//         paid (settled) | refunded | cancelled (by the host before the start)
export const hostedRaces = pgTable(
  "hosted_races",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 5 characters (open races use 4), so the two can never collide. */
    roomCode: text("room_code").notNull(),
    hostUserId: uuid("host_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    pot: integer("pot").notNull(),
    /** Percent per winning place, best first; adds up to 100. */
    shares: integer("shares").array().notNull(),
    message: text("message"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    countdownSeconds: integer("countdown_seconds").notNull(),
    status: text("status").default("scheduled").notNull(),
    raceId: uuid("race_id"),
    /** How it was settled: payouts, cut, refund and why. */
    settlement: jsonb("settlement").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true })
  },
  (table) => [
    uniqueIndex("hosted_races_room_code_idx").on(table.roomCode),
    index("hosted_races_status_starts_idx").on(table.status, table.startsAt)
  ]
)

export type HostedRaceRow = typeof hostedRaces.$inferSelect

// "I'm in": players who signed up for a prize race ahead of time (for the
// reminder and the joined count).
export const hostedRaceSignups = pgTable(
  "hosted_race_signups",
  {
    hostedRaceId: uuid("hosted_race_id")
      .notNull()
      .references(() => hostedRaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    remindedAt: timestamp("reminded_at", { withTimezone: true })
  },
  (table) => [primaryKey({ columns: [table.hostedRaceId, table.userId] })]
)

// One row per player per Kampala day they were seen (written by touchLastSeen).
// This is what daily/weekly/monthly active players and retention are counted
// from. source: live (recorded as it happened) | backfill (reconstructed from
// the ledger, race results and sign-ups when the table was introduced).
export const userActivityDays = pgTable(
  "user_activity_days",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Kampala calendar day, YYYY-MM-DD (see kampalaDay in @tiral/game-core). */
    day: date("day", { mode: "string" }).notNull(),
    source: text("source").default("live").notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] }), index("user_activity_days_day_idx").on(table.day)]
)

export type UserActivityDay = typeof userActivityDays.$inferSelect

// LivTok stock: unsold pieces by bale and grade (they carry over between lives).
export const livtokStock = pgTable(
  "livtok_stock",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bale: text("bale").notNull(),
    grade: text("grade").notNull(),
    count: integer("count").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [primaryKey({ columns: [table.userId, table.bale, table.grade] })]
)
