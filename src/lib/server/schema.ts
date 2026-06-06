export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
	id UUID PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	display_name TEXT,
	terms_version TEXT,
	privacy_version TEXT,
	legal_accepted_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS email_verification_challenges (
	id UUID PRIMARY KEY,
	email TEXT NOT NULL,
	display_name TEXT,
	code_hash TEXT NOT NULL,
	signup_token_hash TEXT,
	attempts INTEGER NOT NULL DEFAULT 0,
	expires_at TIMESTAMPTZ NOT NULL,
	verified_at TIMESTAMPTZ,
	consumed_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_api_tokens (
	id UUID PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	token_hash TEXT NOT NULL,
	encrypted_token JSONB,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_used_at TIMESTAMPTZ,
	revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inbox_sessions (
	id UUID PRIMARY KEY,
	owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	title TEXT NOT NULL,
	summary TEXT,
	encryption_version TEXT NOT NULL DEFAULT 'none',
	encrypted_title JSONB,
	encrypted_summary JSONB,
	read_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inbox_artifacts (
	id UUID PRIMARY KEY,
	session_id UUID NOT NULL REFERENCES inbox_sessions(id) ON DELETE CASCADE,
	filename TEXT NOT NULL,
	content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
	encryption_version TEXT NOT NULL DEFAULT 'none',
	encrypted_filename JSONB,
	encrypted_content_type JSONB,
	encrypted_payload JSONB,
	size_bytes BIGINT NOT NULL DEFAULT 0,
	storage_key TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS e2ee_config (
	id TEXT PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	public_key_jwk JSONB NOT NULL,
	encrypted_private_key JSONB NOT NULL,
	passkey_credential_id TEXT,
	passkey_encrypted_private_key JSONB,
	recovery_hint TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webauthn_credentials (
	id TEXT PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	public_key BYTEA NOT NULL,
	counter BIGINT NOT NULL DEFAULT 0,
	transports TEXT[] NOT NULL DEFAULT '{}',
	device_type TEXT,
	backed_up BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id
	ON webauthn_credentials(user_id);

CREATE INDEX IF NOT EXISTS idx_email_verification_challenges_email_created_at
	ON email_verification_challenges(email, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verification_challenges_signup_token_hash
	ON email_verification_challenges(signup_token_hash)
	WHERE signup_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_api_tokens_user_id
	ON agent_api_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_agent_api_tokens_user_active
	ON agent_api_tokens(user_id, created_at DESC)
	WHERE revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_api_tokens_token_hash
	ON agent_api_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_inbox_artifacts_session_id
	ON inbox_artifacts(session_id);

CREATE INDEX IF NOT EXISTS idx_inbox_sessions_owner_user_id
	ON inbox_sessions(owner_user_id);

CREATE INDEX IF NOT EXISTS idx_inbox_sessions_updated_at
	ON inbox_sessions(updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_e2ee_config_user_id
	ON e2ee_config(user_id);
`;

export const SCHEMA_LOCK_NAMESPACE = 219_541;
export const SCHEMA_LOCK_ID = 1;
