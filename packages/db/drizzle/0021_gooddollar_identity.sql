ALTER TABLE "privy_accounts" ADD COLUMN "identity_root" text;
--> statement-breakpoint
ALTER TABLE "privy_accounts" ADD COLUMN "identity_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "privy_accounts" ADD COLUMN "identity_checked_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "privy_accounts" ADD CONSTRAINT "privy_accounts_identity_root_unique" UNIQUE("identity_root");
