CREATE TABLE "coin_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_id" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "avatar_loadout" SET DEFAULT '{"skin":"#f2bd8c","shirt":"#f59e0b","pants":"#27364d","hat":"cap","hatColor":"#92400e","backpack":"#92400e","shoes":"#26211c","glasses":"none","hair":"short","hairColor":"#2b2118","outfit":"shirt","trail":"none"}'::jsonb;--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coin_ledger_event_unique" ON "coin_ledger" USING btree ("user_id","reason","ref_id");--> statement-breakpoint
CREATE INDEX "coin_ledger_user_created_idx" ON "coin_ledger" USING btree ("user_id","created_at");