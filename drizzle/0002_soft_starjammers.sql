ALTER TABLE "email_drafts" ADD COLUMN IF NOT EXISTS "encrypted_cc" jsonb;--> statement-breakpoint
ALTER TABLE "email_drafts" ADD COLUMN IF NOT EXISTS "encrypted_bcc" jsonb;
