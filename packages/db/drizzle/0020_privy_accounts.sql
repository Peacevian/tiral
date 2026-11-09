CREATE TABLE "privy_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"privy_user_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privy_accounts_privy_user_id_unique" UNIQUE("privy_user_id"),
	CONSTRAINT "privy_accounts_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
ALTER TABLE "privy_accounts" ADD CONSTRAINT "privy_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
