CREATE TABLE "billboard_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_name" text NOT NULL,
	"image_path" text NOT NULL,
	"link" text NOT NULL,
	"slot_ids" text[] NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_ugx" integer NOT NULL,
	"buyer_msisdn" text,
	"relworx_reference" text,
	"relworx_internal_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billboard_campaigns_relworx_reference_unique" UNIQUE("relworx_reference")
);
--> statement-breakpoint
CREATE TABLE "billboard_impressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"race_id" uuid,
	"slot_id" text NOT NULL,
	"campaign_id" uuid,
	"viewer_count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billboard_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"tier" text DEFAULT 'standard' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billboard_impressions" ADD CONSTRAINT "billboard_impressions_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billboard_impressions" ADD CONSTRAINT "billboard_impressions_campaign_id_billboard_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."billboard_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "billboard_slots" ("id", "name", "lat", "lng", "tier") VALUES
  ('slot-start-kampala', 'Kampala Road Start', 0.3136, 32.5811, 'standard'),
  ('slot-start-nakasero', 'Nakasero Start', 0.3202, 32.5845, 'standard'),
  ('slot-start-nasser', 'Nasser Road Start', 0.3178, 32.5792, 'standard'),
  ('slot-start-jinja', 'Jinja Road Start', 0.3116, 32.5852, 'standard'),
  ('slot-start-parliament', 'Parliament Start', 0.3212, 32.5878, 'standard'),
  ('slot-city-square', 'City Square', 0.3134, 32.5808, 'premium'),
  ('slot-nakivubo-gate', 'Nakivubo Gate', 0.3098, 32.5794, 'premium'),
  ('slot-nakasero-junction', 'Nakasero Junction', 0.3190, 32.5815, 'standard')
ON CONFLICT ("id") DO NOTHING;
