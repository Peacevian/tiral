CREATE TABLE "hosted_race_signups" (
	"hosted_race_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminded_at" timestamp with time zone,
	CONSTRAINT "hosted_race_signups_hosted_race_id_user_id_pk" PRIMARY KEY("hosted_race_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "hosted_races" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" text NOT NULL,
	"host_user_id" uuid NOT NULL,
	"pot" integer NOT NULL,
	"shares" integer[] NOT NULL,
	"message" text,
	"starts_at" timestamp with time zone NOT NULL,
	"countdown_seconds" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"race_id" uuid,
	"settlement" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "hosted_race_signups" ADD CONSTRAINT "hosted_race_signups_hosted_race_id_hosted_races_id_fk" FOREIGN KEY ("hosted_race_id") REFERENCES "public"."hosted_races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_race_signups" ADD CONSTRAINT "hosted_race_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_races" ADD CONSTRAINT "hosted_races_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hosted_races_room_code_idx" ON "hosted_races" USING btree ("room_code");--> statement-breakpoint
CREATE INDEX "hosted_races_status_starts_idx" ON "hosted_races" USING btree ("status","starts_at");