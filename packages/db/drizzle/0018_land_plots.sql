CREATE TABLE "land_plots" (
	"plot_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rent_paid_until" timestamp with time zone NOT NULL,
	"building" jsonb
);
--> statement-breakpoint
ALTER TABLE "land_plots" ADD CONSTRAINT "land_plots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "land_plots_user_idx" ON "land_plots" USING btree ("user_id");