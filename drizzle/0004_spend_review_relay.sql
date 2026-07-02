CREATE TABLE "spend_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"encryption_version" text DEFAULT 'e2ee-v1' NOT NULL,
	"encrypted_payee" jsonb NOT NULL,
	"encrypted_amount" jsonb NOT NULL,
	"encrypted_currency" jsonb NOT NULL,
	"encrypted_description" jsonb NOT NULL,
	"encrypted_metadata" jsonb,
	"encrypted_receipt" jsonb,
	"idempotency_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_intent_id" text,
	"reviewed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"charge_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spend_requests_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "user_stripe_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"secret_key_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spend_requests" ADD CONSTRAINT "spend_requests_session_id_inbox_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."inbox_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_requests" ADD CONSTRAINT "spend_requests_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stripe_credentials" ADD CONSTRAINT "user_stripe_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_spend_requests_idempotency" ON "spend_requests" USING btree ("owner_user_id","idempotency_key") WHERE "spend_requests"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_spend_requests_session_id" ON "spend_requests" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_spend_requests_owner_status" ON "spend_requests" USING btree ("owner_user_id","status");
