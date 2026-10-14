CREATE TABLE "life_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "house_tier" text DEFAULT 'kisenyi' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rent_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stress" double precision DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stress_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_event_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "life_events" ADD CONSTRAINT "life_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "life_events_user_created_idx" ON "life_events" USING btree ("user_id","created_at");