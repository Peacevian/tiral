CREATE TABLE "livtok_stock" (
	"user_id" uuid NOT NULL,
	"bale" text NOT NULL,
	"grade" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "livtok_stock_user_id_bale_grade_pk" PRIMARY KEY("user_id","bale","grade")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "followers" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "livtok_stock" ADD CONSTRAINT "livtok_stock_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;