CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE "tiktok_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"open_id" text NOT NULL,
	"union_id" text,
	"scope" text DEFAULT '' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tiktok_accounts_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tiktok_accounts" ADD CONSTRAINT "tiktok_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;