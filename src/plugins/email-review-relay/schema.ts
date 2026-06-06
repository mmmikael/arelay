export const EMAIL_REVIEW_RELAY_SCHEMA_SQL = `
ALTER TABLE inbox_sessions ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'generic';

CREATE TABLE IF NOT EXISTS user_cloudflare_email (
	user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	account_id TEXT NOT NULL,
	api_token_ciphertext TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_drafts (
	id UUID PRIMARY KEY,
	session_id UUID NOT NULL UNIQUE REFERENCES inbox_sessions(id) ON DELETE CASCADE,
	owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	encryption_version TEXT NOT NULL DEFAULT 'none',
	to_address TEXT,
	from_email TEXT,
	from_name TEXT,
	subject TEXT,
	html TEXT,
	text TEXT,
	metadata JSONB,
	encrypted_to JSONB,
	encrypted_from_email JSONB,
	encrypted_from_name JSONB,
	encrypted_subject JSONB,
	encrypted_html JSONB,
	encrypted_text JSONB,
	encrypted_metadata JSONB,
	idempotency_key TEXT,
	status TEXT NOT NULL DEFAULT 'pending',
	reviewed_at TIMESTAMPTZ,
	sent_at TIMESTAMPTZ,
	send_error TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encryption_version TEXT NOT NULL DEFAULT 'none';
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_to JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_from_email JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_from_name JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_subject JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_html JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_text JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_metadata JSONB;
ALTER TABLE email_drafts ALTER COLUMN to_address DROP NOT NULL;
ALTER TABLE email_drafts ALTER COLUMN from_email DROP NOT NULL;
ALTER TABLE email_drafts ALTER COLUMN subject DROP NOT NULL;
ALTER TABLE email_drafts ALTER COLUMN html DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_drafts_idempotency
	ON email_drafts(owner_user_id, idempotency_key)
	WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_drafts_session_id
	ON email_drafts(session_id);

CREATE INDEX IF NOT EXISTS idx_email_drafts_owner_status
	ON email_drafts(owner_user_id, status);
`;
