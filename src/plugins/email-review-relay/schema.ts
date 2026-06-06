export const EMAIL_REVIEW_RELAY_SCHEMA_SQL = `
ALTER TABLE inbox_sessions ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'generic';

CREATE TABLE IF NOT EXISTS user_cloudflare_email (
	user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	account_id_ciphertext TEXT NOT NULL,
	api_token_ciphertext TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_cloudflare_email ADD COLUMN IF NOT EXISTS account_id_ciphertext TEXT;
ALTER TABLE user_cloudflare_email DROP COLUMN IF EXISTS account_id;

CREATE TABLE IF NOT EXISTS email_drafts (
	id UUID PRIMARY KEY,
	session_id UUID NOT NULL UNIQUE REFERENCES inbox_sessions(id) ON DELETE CASCADE,
	owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	encryption_version TEXT NOT NULL DEFAULT 'e2ee-v1',
	encrypted_to JSONB NOT NULL,
	encrypted_from_email JSONB NOT NULL,
	encrypted_from_name JSONB,
	encrypted_subject JSONB NOT NULL,
	encrypted_html JSONB NOT NULL,
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

ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encryption_version TEXT NOT NULL DEFAULT 'e2ee-v1';
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_to JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_from_email JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_from_name JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_subject JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_html JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_text JSONB;
ALTER TABLE email_drafts ADD COLUMN IF NOT EXISTS encrypted_metadata JSONB;
ALTER TABLE email_drafts ALTER COLUMN encryption_version SET DEFAULT 'e2ee-v1';

DELETE FROM email_drafts
WHERE encrypted_to IS NULL
	OR encrypted_from_email IS NULL
	OR encrypted_subject IS NULL
	OR encrypted_html IS NULL;

ALTER TABLE email_drafts DROP COLUMN IF EXISTS to_address;
ALTER TABLE email_drafts DROP COLUMN IF EXISTS from_email;
ALTER TABLE email_drafts DROP COLUMN IF EXISTS from_name;
ALTER TABLE email_drafts DROP COLUMN IF EXISTS subject;
ALTER TABLE email_drafts DROP COLUMN IF EXISTS html;
ALTER TABLE email_drafts DROP COLUMN IF EXISTS text;
ALTER TABLE email_drafts DROP COLUMN IF EXISTS metadata;

ALTER TABLE email_drafts ALTER COLUMN encrypted_to SET NOT NULL;
ALTER TABLE email_drafts ALTER COLUMN encrypted_from_email SET NOT NULL;
ALTER TABLE email_drafts ALTER COLUMN encrypted_subject SET NOT NULL;
ALTER TABLE email_drafts ALTER COLUMN encrypted_html SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_drafts_idempotency
	ON email_drafts(owner_user_id, idempotency_key)
	WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_drafts_session_id
	ON email_drafts(session_id);

CREATE INDEX IF NOT EXISTS idx_email_drafts_owner_status
	ON email_drafts(owner_user_id, status);
`;
