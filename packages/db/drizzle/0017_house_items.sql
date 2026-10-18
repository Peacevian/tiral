CREATE TABLE "house_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item" text NOT NULL,
	"grade" text NOT NULL,
	"color" text NOT NULL,
	"price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "house_loadout" SET DEFAULT '{"version":1,"wallMaterial":"plaster","floorMaterial":"tile","roofMaterial":"ironsheet","colors":{"wall":"#e7e5e4","floor":"#a8a29e","roof":"#7f1d1d","trim":"#f59e0b"},"items":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "rest_factor" double precision DEFAULT 0.7 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "calm_factor" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "house_items" ADD CONSTRAINT "house_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "house_items_user_idx" ON "house_items" USING btree ("user_id");--> statement-breakpoint
-- Everyone starts with an empty room: furniture is bought now (nobody owns any yet).
UPDATE "users" SET "house_loadout" = jsonb_set("house_loadout", '{items}', '[]'::jsonb) WHERE "house_loadout" IS NOT NULL;
