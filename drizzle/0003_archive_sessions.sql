ALTER TABLE "inbox_sessions" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbox_sessions_owner_active" ON "inbox_sessions" USING btree ("owner_user_id","updated_at" DESC NULLS LAST) WHERE "inbox_sessions"."archived_at" IS NULL;
