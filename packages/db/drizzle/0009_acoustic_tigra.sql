CREATE TABLE "bikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text NOT NULL,
	"status" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"look" jsonb,
	"wear" double precision DEFAULT 0 NOT NULL,
	"lease_weekly" integer,
	"lease_weeks_total" integer,
	"lease_weeks_paid" integer DEFAULT 0 NOT NULL,
	"lease_due_at" timestamp with time zone,
	"lease_missed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bikes" ADD CONSTRAINT "bikes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bikes_user_idx" ON "bikes" USING btree ("user_id");