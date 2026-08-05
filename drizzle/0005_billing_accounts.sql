CREATE TABLE "billing_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"stripe_customer_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"plan_source" text,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"current_period_end" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_billing_accounts_stripe_customer_id" ON "billing_accounts" USING btree ("stripe_customer_id") WHERE "billing_accounts"."stripe_customer_id" IS NOT NULL;
