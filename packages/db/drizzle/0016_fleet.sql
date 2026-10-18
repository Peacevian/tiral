CREATE TABLE "fleet_bikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text NOT NULL,
	"rider" text NOT NULL,
	"skill" double precision DEFAULT 1 NOT NULL,
	"wear" double precision DEFAULT 0 NOT NULL,
	"tracker" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fleet_bikes" ADD CONSTRAINT "fleet_bikes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fleet_bikes_user_idx" ON "fleet_bikes" USING btree ("user_id");