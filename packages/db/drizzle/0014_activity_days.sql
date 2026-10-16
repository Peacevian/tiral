CREATE TABLE "user_activity_days" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"source" text DEFAULT 'live' NOT NULL,
	CONSTRAINT "user_activity_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "user_activity_days" ADD CONSTRAINT "user_activity_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_activity_days_day_idx" ON "user_activity_days" USING btree ("day");--> statement-breakpoint
CREATE INDEX "coin_ledger_created_idx" ON "coin_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "coin_ledger_reason_created_idx" ON "coin_ledger" USING btree ("reason","created_at");--> statement-breakpoint
CREATE INDEX "races_finished_idx" ON "races" USING btree ("finished_at");--> statement-breakpoint
CREATE INDEX "users_created_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_last_seen_idx" ON "users" USING btree ("last_seen_at");--> statement-breakpoint
-- Backfill: every day a player left a trace before this table existed, as a
-- Kampala day (UTC+3, the same as kampalaDay in @tiral/game-core). Only rows
-- the player caused count: grants an admin made and refunds the scheduler
-- paid are left out. Marked 'backfill' because browsing-only visits left no
-- trace, so these days undercount a little.
INSERT INTO "user_activity_days" ("user_id", "day", "source")
SELECT "user_id", (("created_at" AT TIME ZONE 'UTC') + interval '3 hours')::date, 'backfill'
FROM "coin_ledger" WHERE "reason" NOT IN ('admin_grant', 'prize_refund')
UNION
SELECT "user_id", (("finished_at" AT TIME ZONE 'UTC') + interval '3 hours')::date, 'backfill'
FROM "race_results" WHERE "user_id" IS NOT NULL
UNION
SELECT "user_id", (("resolved_at" AT TIME ZONE 'UTC') + interval '3 hours')::date, 'backfill'
FROM "life_events" WHERE "resolved_at" IS NOT NULL AND "status" IN ('paid', 'refused')
UNION
SELECT "id", (("created_at" AT TIME ZONE 'UTC') + interval '3 hours')::date, 'backfill' FROM "users"
UNION
SELECT "id", (("last_seen_at" AT TIME ZONE 'UTC') + interval '3 hours')::date, 'backfill' FROM "users"
ON CONFLICT DO NOTHING;
