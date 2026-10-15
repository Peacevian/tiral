ALTER TABLE "coin_ledger" DROP CONSTRAINT "coin_ledger_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "coin_ledger" ADD CONSTRAINT "coin_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- The coin ledger is append-only: balances are sums of its rows, so an edited
-- or deleted row silently changes someone's money. Refuse both outright.
CREATE OR REPLACE FUNCTION coin_ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'coin_ledger is append-only (% refused)', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS coin_ledger_append_only ON "coin_ledger";--> statement-breakpoint
CREATE TRIGGER coin_ledger_append_only BEFORE UPDATE OR DELETE ON "coin_ledger" FOR EACH ROW EXECUTE FUNCTION coin_ledger_append_only();
