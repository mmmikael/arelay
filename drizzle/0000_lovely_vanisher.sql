CREATE TABLE "agent_api_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"encrypted_token" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "e2ee_config" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key_jwk" jsonb NOT NULL,
	"encrypted_private_key" jsonb NOT NULL,
	"passkey_credential_id" text,
	"passkey_encrypted_private_key" jsonb,
	"recovery_hint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_verification_challenges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"code_hash" text NOT NULL,
	"signup_token_hash" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_artifacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"encryption_version" text DEFAULT 'e2ee-v1' NOT NULL,
	"encrypted_filename" jsonb,
	"encrypted_content_type" jsonb,
	"encrypted_payload" jsonb,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"delivery_type" text DEFAULT 'generic' NOT NULL,
	"encryption_version" text DEFAULT 'e2ee-v1' NOT NULL,
	"encrypted_title" jsonb,
	"encrypted_summary" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"terms_version" text,
	"privacy_version" text,
	"legal_accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" "bytea" NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"device_type" text,
	"backed_up" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"encryption_version" text DEFAULT 'e2ee-v1' NOT NULL,
	"encrypted_to" jsonb NOT NULL,
	"encrypted_from_email" jsonb NOT NULL,
	"encrypted_from_name" jsonb,
	"encrypted_subject" jsonb NOT NULL,
	"encrypted_html" jsonb NOT NULL,
	"encrypted_text" jsonb,
	"encrypted_metadata" jsonb,
	"encrypted_review" jsonb,
	"encrypted_sent" jsonb,
	"idempotency_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"send_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_drafts_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "user_cloudflare_email" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"account_id_ciphertext" text NOT NULL,
	"api_token_ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_api_tokens" ADD CONSTRAINT "agent_api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "e2ee_config" ADD CONSTRAINT "e2ee_config_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_artifacts" ADD CONSTRAINT "inbox_artifacts_session_id_inbox_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."inbox_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_sessions" ADD CONSTRAINT "inbox_sessions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_session_id_inbox_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."inbox_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD CONSTRAINT "email_drafts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cloudflare_email" ADD CONSTRAINT "user_cloudflare_email_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_api_tokens_user_id" ON "agent_api_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_agent_api_tokens_user_active" ON "agent_api_tokens" USING btree ("user_id","created_at" DESC NULLS LAST) WHERE "agent_api_tokens"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_api_tokens_token_hash" ON "agent_api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_e2ee_config_user_id" ON "e2ee_config" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_email_verification_challenges_email_created_at" ON "email_verification_challenges" USING btree ("email","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_email_verification_challenges_signup_token_hash" ON "email_verification_challenges" USING btree ("signup_token_hash") WHERE "email_verification_challenges"."signup_token_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_inbox_artifacts_session_id" ON "inbox_artifacts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_inbox_sessions_owner_user_id" ON "inbox_sessions" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_inbox_sessions_updated_at" ON "inbox_sessions" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_webauthn_credentials_user_id" ON "webauthn_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_email_drafts_idempotency" ON "email_drafts" USING btree ("owner_user_id","idempotency_key") WHERE "email_drafts"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_email_drafts_session_id" ON "email_drafts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_email_drafts_owner_status" ON "email_drafts" USING btree ("owner_user_id","status");