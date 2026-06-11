import { createHash, randomUUID } from 'node:crypto';
import { getDb } from './db-connection';
import { ensureSchema } from './db-schema-check';

export { getDb } from './db-connection';
export { ensureSchema } from './db-schema-check';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type InboxSession = {
	id: string;
	owner_user_id: string | null;
	encryption_version: string;
	encrypted_title: JsonObject | null;
	encrypted_summary: JsonObject | null;
	read_at: Date | null;
	created_at: Date;
	updated_at: Date;
	artifact_count?: number;
	is_read: boolean;
};

export type InboxArtifact = {
	id: string;
	session_id: string;
	filename: string;
	content_type: string;
	encryption_version: string;
	encrypted_filename: JsonObject | null;
	encrypted_content_type: JsonObject | null;
	encrypted_payload: JsonObject | null;
	size_bytes: number;
	storage_key: string;
	created_at: Date;
};

export type E2eeConfig = {
	id: string;
	user_id: string | null;
	public_key_jwk: JsonObject;
	encrypted_private_key: JsonObject;
	passkey_credential_id: string | null;
	passkey_encrypted_private_key: JsonObject | null;
	recovery_hint: string | null;
	created_at: Date;
	updated_at: Date;
};

export type User = {
	id: string;
	email: string;
	display_name: string | null;
	terms_version: string | null;
	privacy_version: string | null;
	legal_accepted_at: Date | null;
	created_at: Date;
	updated_at: Date;
};

export type EmailVerificationChallenge = {
	id: string;
	email: string;
	display_name: string | null;
	code_hash: string;
	signup_token_hash: string | null;
	attempts: number;
	expires_at: Date;
	verified_at: Date | null;
	consumed_at: Date | null;
	created_at: Date;
};

export type AgentApiToken = {
	id: string;
	user_id: string;
	name: string;
	token_hash: string;
	encrypted_token: JsonObject | null;
	created_at: Date;
	last_used_at: Date | null;
	revoked_at: Date | null;
};

export type AgentApiTokenAuthResult = {
	user: User;
	tokenId: string;
};

export type WebAuthnCredentialRow = {
	id: string;
	user_id: string;
	public_key: Buffer;
	counter: number;
	transports: string[];
	device_type: string | null;
	backed_up: boolean;
	created_at: Date;
	last_used_at: Date | null;
};

export type PasskeySummary = {
	id: string;
	transports: string[];
	device_type: string | null;
	backed_up: boolean;
	created_at: Date;
	last_used_at: Date | null;
};

export function hashAgentToken(token: string): string {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function listSessions(ownerUserId: string): Promise<InboxSession[]> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<InboxSession[]>`
		SELECT
			s.id,
			s.owner_user_id,
			s.encryption_version,
			s.encrypted_title,
			s.encrypted_summary,
			s.read_at,
			s.created_at,
			s.updated_at,
			(s.read_at IS NOT NULL) AS is_read,
			COUNT(a.id)::int AS artifact_count
		FROM inbox_sessions s
		LEFT JOIN inbox_artifacts a ON a.session_id = s.id
		WHERE s.owner_user_id = ${ownerUserId}
		GROUP BY s.id
		ORDER BY s.updated_at DESC
	`;
	return rows.map((row) => ({
		...row,
		artifact_count: Number(row.artifact_count ?? 0)
	}));
}

export async function getInboxSessionStats(ownerUserId: string): Promise<{
	sessionCount: number;
	readCount: number;
	latestUpdatedAt: Date | null;
}> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<
		{ session_count: number; read_count: number; latest_updated_at: Date | null }[]
	>`
		SELECT
			COUNT(*)::int AS session_count,
			COUNT(read_at)::int AS read_count,
			MAX(updated_at) AS latest_updated_at
		FROM inbox_sessions
		WHERE owner_user_id = ${ownerUserId}
	`;
	const row = rows[0];
	return {
		sessionCount: Number(row?.session_count ?? 0),
		readCount: Number(row?.read_count ?? 0),
		latestUpdatedAt: row?.latest_updated_at ?? null
	};
}

export async function getSession(id: string, ownerUserId?: string): Promise<InboxSession | null> {
	await ensureSchema();
	const db = getDb();
	const rows = ownerUserId
		? await db<InboxSession[]>`
		SELECT
			id,
			owner_user_id,
			encryption_version,
			encrypted_title,
			encrypted_summary,
			read_at,
			created_at,
			updated_at,
			(read_at IS NOT NULL) AS is_read
		FROM inbox_sessions
		WHERE id = ${id} AND owner_user_id = ${ownerUserId}
		LIMIT 1
	`
		: await db<InboxSession[]>`
		SELECT
			id,
			owner_user_id,
			encryption_version,
			encrypted_title,
			encrypted_summary,
			read_at,
			created_at,
			updated_at,
			(read_at IS NOT NULL) AS is_read
		FROM inbox_sessions
		WHERE id = ${id}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function createEncryptedSession(input: {
	id: string;
	ownerUserId: string;
	encryptedTitle: JsonObject;
	encryptedSummary?: JsonObject | null;
}): Promise<InboxSession> {
	await ensureSchema();
	const db = getDb();
	const encryptedSummary = input.encryptedSummary ?? null;
	const rows = await db<InboxSession[]>`
		INSERT INTO inbox_sessions (
			id,
			owner_user_id,
			encryption_version,
			encrypted_title,
			encrypted_summary
		)
		VALUES (
			${input.id},
			${input.ownerUserId},
			${'e2ee-v1'},
			${db.json(input.encryptedTitle)},
			${encryptedSummary ? db.json(encryptedSummary) : null}
		)
		RETURNING
			id,
			owner_user_id,
			encryption_version,
			encrypted_title,
			encrypted_summary,
			read_at,
			created_at,
			updated_at,
			(read_at IS NOT NULL) AS is_read
	`;
	return rows[0];
}

export async function countAgentSessionsCreatedSince(
	ownerUserId: string,
	since: Date
): Promise<number> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<Array<{ count: number }>>`
		SELECT COUNT(*)::int AS count
		FROM inbox_sessions
		WHERE owner_user_id = ${ownerUserId}
			AND created_at > ${since}
	`;
	return rows[0]?.count ?? 0;
}

export async function getOldestAgentSessionCreatedAtSince(
	ownerUserId: string,
	since: Date
): Promise<Date | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<Array<{ created_at: Date }>>`
		SELECT created_at
		FROM inbox_sessions
		WHERE owner_user_id = ${ownerUserId}
			AND created_at > ${since}
		ORDER BY created_at ASC
		LIMIT 1
	`;
	return rows[0]?.created_at ?? null;
}

export async function updateEncryptedSession(
	id: string,
	ownerUserId: string,
	input: { encryptedTitle?: JsonObject; encryptedSummary?: JsonObject | null }
): Promise<InboxSession | null> {
	await ensureSchema();
	const db = getDb();
	const existing = await getSession(id, ownerUserId);
	if (!existing) return null;

	const encryptedTitle = input.encryptedTitle ?? existing.encrypted_title;
	const encryptedSummary =
		input.encryptedSummary !== undefined ? input.encryptedSummary : existing.encrypted_summary;

	const rows = await db<InboxSession[]>`
		UPDATE inbox_sessions
		SET
			encryption_version = 'e2ee-v1',
			encrypted_title = ${encryptedTitle ? db.json(encryptedTitle) : null},
			encrypted_summary = ${encryptedSummary ? db.json(encryptedSummary) : null},
			read_at = NULL,
			updated_at = NOW()
		WHERE id = ${id} AND owner_user_id = ${ownerUserId}
		RETURNING
			id,
			owner_user_id,
			encryption_version,
			encrypted_title,
			encrypted_summary,
			read_at,
			created_at,
			updated_at,
			(read_at IS NOT NULL) AS is_read
	`;
	return rows[0] ?? null;
}

export async function setSessionReadState(
	id: string,
	ownerUserId: string,
	isRead: boolean
): Promise<InboxSession | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<InboxSession[]>`
		UPDATE inbox_sessions
		SET read_at = CASE WHEN ${isRead} THEN NOW() ELSE NULL END
		WHERE id = ${id} AND owner_user_id = ${ownerUserId}
		RETURNING
			id,
			owner_user_id,
			encryption_version,
			encrypted_title,
			encrypted_summary,
			read_at,
			created_at,
			updated_at,
			(read_at IS NOT NULL) AS is_read
	`;
	return rows[0] ?? null;
}

export async function touchSession(id: string): Promise<void> {
	await ensureSchema();
	const db = getDb();
	await db`
		UPDATE inbox_sessions
		SET updated_at = NOW(), read_at = NULL
		WHERE id = ${id}
	`;
}

export async function deleteSession(id: string, ownerUserId: string): Promise<boolean> {
	await ensureSchema();
	const db = getDb();
	const rows = await db`
		DELETE FROM inbox_sessions
		WHERE id = ${id} AND owner_user_id = ${ownerUserId}
		RETURNING id
	`;
	return rows.length > 0;
}

export async function listArtifacts(sessionId: string, ownerUserId?: string): Promise<InboxArtifact[]> {
	await ensureSchema();
	const db = getDb();
	if (ownerUserId) {
		return db<InboxArtifact[]>`
		SELECT
			a.id,
			a.session_id,
			a.filename,
			a.content_type,
			a.encryption_version,
			a.encrypted_filename,
			a.encrypted_content_type,
			a.encrypted_payload,
			a.size_bytes,
			a.storage_key,
			a.created_at
		FROM inbox_artifacts a
		JOIN inbox_sessions s ON s.id = a.session_id
		WHERE a.session_id = ${sessionId} AND s.owner_user_id = ${ownerUserId}
		ORDER BY a.created_at ASC
	`;
	}
	return db<InboxArtifact[]>`
		SELECT
			id,
			session_id,
			filename,
			content_type,
			encryption_version,
			encrypted_filename,
			encrypted_content_type,
			encrypted_payload,
			size_bytes,
			storage_key,
			created_at
		FROM inbox_artifacts
		WHERE session_id = ${sessionId}
		ORDER BY created_at ASC
	`;
}

export async function getArtifact(id: string, ownerUserId?: string): Promise<InboxArtifact | null> {
	await ensureSchema();
	const db = getDb();
	const rows = ownerUserId
		? await db<InboxArtifact[]>`
		SELECT
			a.id,
			a.session_id,
			a.filename,
			a.content_type,
			a.encryption_version,
			a.encrypted_filename,
			a.encrypted_content_type,
			a.encrypted_payload,
			a.size_bytes,
			a.storage_key,
			a.created_at
		FROM inbox_artifacts a
		JOIN inbox_sessions s ON s.id = a.session_id
		WHERE a.id = ${id} AND s.owner_user_id = ${ownerUserId}
		LIMIT 1
	`
		: await db<InboxArtifact[]>`
		SELECT
			id,
			session_id,
			filename,
			content_type,
			encryption_version,
			encrypted_filename,
			encrypted_content_type,
			encrypted_payload,
			size_bytes,
			storage_key,
			created_at
		FROM inbox_artifacts
		WHERE id = ${id}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function getAccountStorageUsedBytes(ownerUserId: string): Promise<number> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<{ total: string | number | null }[]>`
		SELECT COALESCE(SUM(a.size_bytes), 0) AS total
		FROM inbox_artifacts a
		JOIN inbox_sessions s ON s.id = a.session_id
		WHERE s.owner_user_id = ${ownerUserId}
	`;
	return Number(rows[0]?.total ?? 0);
}

export async function countAgentArtifactsCreatedSince(
	ownerUserId: string,
	since: Date
): Promise<number> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<Array<{ count: number }>>`
		SELECT COUNT(*)::int AS count
		FROM inbox_artifacts a
		JOIN inbox_sessions s ON s.id = a.session_id
		WHERE s.owner_user_id = ${ownerUserId}
			AND a.created_at > ${since}
	`;
	return rows[0]?.count ?? 0;
}

export async function getOldestAgentArtifactCreatedAtSince(
	ownerUserId: string,
	since: Date
): Promise<Date | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<Array<{ created_at: Date }>>`
		SELECT a.created_at
		FROM inbox_artifacts a
		JOIN inbox_sessions s ON s.id = a.session_id
		WHERE s.owner_user_id = ${ownerUserId}
			AND a.created_at > ${since}
		ORDER BY a.created_at ASC
		LIMIT 1
	`;
	return rows[0]?.created_at ?? null;
}

export async function createArtifact(input: {
	id: string;
	sessionId: string;
	filename: string;
	contentType: string;
	sizeBytes: number;
	storageKey: string;
	encryptionVersion?: string;
	encryptedFilename?: JsonObject | null;
	encryptedContentType?: JsonObject | null;
	encryptedPayload?: JsonObject | null;
}): Promise<InboxArtifact> {
	await ensureSchema();
	const db = getDb();
	const encryptedFilename = input.encryptedFilename ?? null;
	const encryptedContentType = input.encryptedContentType ?? null;
	const encryptedPayload = input.encryptedPayload ?? null;
	const rows = await db<InboxArtifact[]>`
		INSERT INTO inbox_artifacts (
			id,
			session_id,
			filename,
			content_type,
			size_bytes,
			storage_key,
			encryption_version,
			encrypted_filename,
			encrypted_content_type,
			encrypted_payload
		)
		VALUES (
			${input.id},
			${input.sessionId},
			${input.filename},
			${input.contentType},
			${input.sizeBytes},
			${input.storageKey},
			${input.encryptionVersion ?? 'e2ee-v1'},
			${encryptedFilename ? db.json(encryptedFilename) : null},
			${encryptedContentType ? db.json(encryptedContentType) : null},
			${encryptedPayload ? db.json(encryptedPayload) : null}
		)
		RETURNING
			id,
			session_id,
			filename,
			content_type,
			encryption_version,
			encrypted_filename,
			encrypted_content_type,
			encrypted_payload,
			size_bytes,
			storage_key,
			created_at
	`;
	await touchSession(input.sessionId);
	return rows[0];
}

export async function deleteArtifact(id: string, sessionId: string): Promise<boolean> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<Array<{ id: string }>>`
		DELETE FROM inbox_artifacts
		WHERE id = ${id} AND session_id = ${sessionId}
		RETURNING id
	`;
	return rows.length > 0;
}

export async function getE2eeConfig(userId: string): Promise<E2eeConfig | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<E2eeConfig[]>`
		SELECT
			id,
			user_id,
			public_key_jwk,
			encrypted_private_key,
			passkey_credential_id,
			passkey_encrypted_private_key,
			recovery_hint,
			created_at,
			updated_at
		FROM e2ee_config
		WHERE user_id = ${userId}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function upsertE2eeConfig(userId: string, input: {
	publicKeyJwk: JsonObject;
	encryptedPrivateKey: JsonObject;
	passkeyCredentialId?: string | null;
	passkeyEncryptedPrivateKey?: JsonObject | null;
	recoveryHint?: string | null;
}): Promise<E2eeConfig> {
	await ensureSchema();
	const db = getDb();
	const passkeyEncryptedPrivateKey = input.passkeyEncryptedPrivateKey ?? null;
	const id = `user:${userId}`;
	const rows = await db<E2eeConfig[]>`
		INSERT INTO e2ee_config (
			id,
			user_id,
			public_key_jwk,
			encrypted_private_key,
			passkey_credential_id,
			passkey_encrypted_private_key,
			recovery_hint
		)
		VALUES (
			${id},
			${userId},
			${db.json(input.publicKeyJwk)},
			${db.json(input.encryptedPrivateKey)},
			${input.passkeyCredentialId ?? null},
			${passkeyEncryptedPrivateKey ? db.json(passkeyEncryptedPrivateKey) : null},
			${input.recoveryHint ?? null}
		)
		ON CONFLICT (id)
		DO UPDATE SET
			user_id = EXCLUDED.user_id,
			public_key_jwk = EXCLUDED.public_key_jwk,
			encrypted_private_key = EXCLUDED.encrypted_private_key,
			passkey_credential_id = EXCLUDED.passkey_credential_id,
			passkey_encrypted_private_key = EXCLUDED.passkey_encrypted_private_key,
			recovery_hint = EXCLUDED.recovery_hint,
			updated_at = NOW()
		RETURNING
			id,
			user_id,
			public_key_jwk,
			encrypted_private_key,
			passkey_credential_id,
			passkey_encrypted_private_key,
			recovery_hint,
			created_at,
			updated_at
	`;
	return rows[0];
}

export async function listArtifactStorageKeys(sessionId: string, ownerUserId: string): Promise<string[]> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<{ storage_key: string }[]>`
		SELECT a.storage_key
		FROM inbox_artifacts a
		JOIN inbox_sessions s ON s.id = a.session_id
		WHERE a.session_id = ${sessionId} AND s.owner_user_id = ${ownerUserId}
	`;
	return rows.map((row) => row.storage_key);
}

export async function getUser(id: string): Promise<User | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<User[]>`
		SELECT
			id,
			email,
			display_name,
			terms_version,
			privacy_version,
			legal_accepted_at,
			created_at,
			updated_at
		FROM users
		WHERE id = ${id}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<User[]>`
		SELECT
			id,
			email,
			display_name,
			terms_version,
			privacy_version,
			legal_accepted_at,
			created_at,
			updated_at
		FROM users
		WHERE lower(email) = lower(${email})
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function getUserByActiveAgentTokenHash(
	tokenHash: string
): Promise<AgentApiTokenAuthResult | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<
		(User & {
			agent_token_id: string;
		})[]
	>`
		SELECT
			u.id,
			u.email,
			u.display_name,
			u.terms_version,
			u.privacy_version,
			u.legal_accepted_at,
			u.created_at,
			u.updated_at,
			t.id AS agent_token_id
		FROM agent_api_tokens t
		JOIN users u ON u.id = t.user_id
		WHERE t.token_hash = ${tokenHash} AND t.revoked_at IS NULL
		LIMIT 1
	`;
	const row = rows[0];
	if (!row) return null;
	const { agent_token_id, ...user } = row;
	return { user, tokenId: agent_token_id };
}

export async function markAgentTokenUsed(tokenId: string): Promise<void> {
	await ensureSchema();
	const db = getDb();
	await db`
		UPDATE agent_api_tokens
		SET last_used_at = NOW()
		WHERE id = ${tokenId} AND revoked_at IS NULL
	`;
}

export async function createAgentApiToken(input: {
	userId: string;
	name: string;
	tokenHash: string;
	encryptedToken?: JsonObject | null;
}): Promise<AgentApiToken> {
	await ensureSchema();
	const db = getDb();
	const encryptedToken = input.encryptedToken ?? null;
	const rows = await db<AgentApiToken[]>`
		INSERT INTO agent_api_tokens (id, user_id, name, token_hash, encrypted_token)
		VALUES (
			${randomUUID()},
			${input.userId},
			${input.name},
			${input.tokenHash},
			${encryptedToken ? db.json(encryptedToken) : null}
		)
		RETURNING
			id,
			user_id,
			name,
			token_hash,
			encrypted_token,
			created_at,
			last_used_at,
			revoked_at
	`;
	return rows[0];
}

export async function listAgentApiTokensForUser(userId: string): Promise<AgentApiToken[]> {
	await ensureSchema();
	const db = getDb();
	return db<AgentApiToken[]>`
		SELECT
			id,
			user_id,
			name,
			token_hash,
			encrypted_token,
			created_at,
			last_used_at,
			revoked_at
		FROM agent_api_tokens
		WHERE user_id = ${userId} AND revoked_at IS NULL
		ORDER BY created_at DESC
	`;
}

export async function revokeAgentApiToken(userId: string, tokenId: string): Promise<boolean> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<{ id: string }[]>`
		UPDATE agent_api_tokens
		SET revoked_at = NOW()
		WHERE id = ${tokenId} AND user_id = ${userId} AND revoked_at IS NULL
		RETURNING id
	`;
	return rows.length > 0;
}

export async function createUser(input: {
	id?: string;
	email: string;
	displayName?: string | null;
	termsVersion: string;
	privacyVersion: string;
}): Promise<User> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<User[]>`
		INSERT INTO users (
			id,
			email,
			display_name,
			terms_version,
			privacy_version,
			legal_accepted_at
		)
		VALUES (
			${input.id ?? randomUUID()},
			${input.email.trim().toLowerCase()},
			${input.displayName?.trim() || null},
			${input.termsVersion},
			${input.privacyVersion},
			NOW()
		)
		RETURNING
			id,
			email,
			display_name,
			terms_version,
			privacy_version,
			legal_accepted_at,
			created_at,
			updated_at
	`;
	return rows[0];
}

export async function recordLegalAcceptance(input: {
	userId: string;
	termsVersion: string;
	privacyVersion: string;
}): Promise<User | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<User[]>`
		UPDATE users
		SET
			terms_version = ${input.termsVersion},
			privacy_version = ${input.privacyVersion},
			legal_accepted_at = NOW(),
			updated_at = NOW()
		WHERE id = ${input.userId}
		RETURNING
			id,
			email,
			display_name,
			terms_version,
			privacy_version,
			legal_accepted_at,
			created_at,
			updated_at
	`;
	return rows[0] ?? null;
}

export async function getRecentEmailVerificationCreatedAt(
	email: string,
	withinMs: number
): Promise<Date | null> {
	await ensureSchema();
	const db = getDb();
	const since = new Date(Date.now() - withinMs);
	const rows = await db<Array<{ created_at: Date }>>`
		SELECT created_at
		FROM email_verification_challenges
		WHERE email = ${email.trim().toLowerCase()}
			AND created_at > ${since}
		ORDER BY created_at DESC
		LIMIT 1
	`;
	return rows[0]?.created_at ?? null;
}

export async function createEmailVerificationChallenge(input: {
	email: string;
	displayName?: string | null;
	codeHash: string;
	expiresAt: Date;
}): Promise<EmailVerificationChallenge> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<EmailVerificationChallenge[]>`
		INSERT INTO email_verification_challenges (
			id,
			email,
			display_name,
			code_hash,
			expires_at
		)
		VALUES (
			${randomUUID()},
			${input.email.trim().toLowerCase()},
			${input.displayName?.trim() || null},
			${input.codeHash},
			${input.expiresAt}
		)
		RETURNING
			id,
			email,
			display_name,
			code_hash,
			signup_token_hash,
			attempts,
			expires_at,
			verified_at,
			consumed_at,
			created_at
	`;
	return rows[0];
}

export async function deleteEmailVerificationChallenge(id: string): Promise<void> {
	await ensureSchema();
	const db = getDb();
	await db`
		DELETE FROM email_verification_challenges
		WHERE id = ${id}
	`;
}

export async function verifyEmailVerificationCode(input: {
	email: string;
	codeHash: string;
	signupTokenHash: string;
}): Promise<EmailVerificationChallenge | null> {
	await ensureSchema();
	const db = getDb();
	const email = input.email.trim().toLowerCase();
	const rows = await db<EmailVerificationChallenge[]>`
		UPDATE email_verification_challenges
		SET verified_at = NOW(),
			signup_token_hash = ${input.signupTokenHash}
		WHERE id = (
			SELECT id
			FROM email_verification_challenges
			WHERE email = ${email}
				AND consumed_at IS NULL
				AND verified_at IS NULL
				AND expires_at > NOW()
				AND attempts < 5
			ORDER BY created_at DESC
			LIMIT 1
		)
			AND code_hash = ${input.codeHash}
		RETURNING
			id,
			email,
			display_name,
			code_hash,
			signup_token_hash,
			attempts,
			expires_at,
			verified_at,
			consumed_at,
			created_at
	`;

	if (rows[0]) return rows[0];

	await db`
		UPDATE email_verification_challenges
		SET attempts = attempts + 1
		WHERE id = (
			SELECT id
			FROM email_verification_challenges
			WHERE email = ${email}
				AND consumed_at IS NULL
				AND verified_at IS NULL
				AND expires_at > NOW()
			ORDER BY created_at DESC
			LIMIT 1
		)
	`;
	return null;
}

export async function getEmailVerificationBySignupToken(input: {
	email: string;
	signupTokenHash: string;
}): Promise<EmailVerificationChallenge | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<EmailVerificationChallenge[]>`
		SELECT
			id,
			email,
			display_name,
			code_hash,
			signup_token_hash,
			attempts,
			expires_at,
			verified_at,
			consumed_at,
			created_at
		FROM email_verification_challenges
		WHERE email = ${input.email.trim().toLowerCase()}
			AND signup_token_hash = ${input.signupTokenHash}
			AND verified_at IS NOT NULL
			AND consumed_at IS NULL
			AND expires_at > NOW()
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function consumeEmailVerificationChallenge(id: string): Promise<void> {
	await ensureSchema();
	const db = getDb();
	await db`
		UPDATE email_verification_challenges
		SET consumed_at = NOW()
		WHERE id = ${id}
	`;
}

export async function listCredentialsForUser(userId: string): Promise<WebAuthnCredentialRow[]> {
	await ensureSchema();
	const db = getDb();
	return db<WebAuthnCredentialRow[]>`
		SELECT
			id,
			user_id,
			public_key,
			counter,
			transports,
			device_type,
			backed_up,
			created_at,
			last_used_at
		FROM webauthn_credentials
		WHERE user_id = ${userId}
		ORDER BY created_at ASC
	`;
}

export async function listPasskeysForUser(userId: string): Promise<PasskeySummary[]> {
	await ensureSchema();
	const db = getDb();
	return db<PasskeySummary[]>`
		SELECT
			id,
			transports,
			device_type,
			backed_up,
			created_at,
			last_used_at
		FROM webauthn_credentials
		WHERE user_id = ${userId}
		ORDER BY COALESCE(last_used_at, created_at) DESC, created_at DESC
	`;
}

export async function getWebAuthnCredential(id: string): Promise<WebAuthnCredentialRow | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<WebAuthnCredentialRow[]>`
		SELECT
			id,
			user_id,
			public_key,
			counter,
			transports,
			device_type,
			backed_up,
			created_at,
			last_used_at
		FROM webauthn_credentials
		WHERE id = ${id}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function createWebAuthnCredential(input: {
	id: string;
	userId: string;
	publicKey: Uint8Array;
	counter: number;
	transports?: string[];
	deviceType?: string | null;
	backedUp?: boolean;
}): Promise<WebAuthnCredentialRow> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<WebAuthnCredentialRow[]>`
		INSERT INTO webauthn_credentials (
			id,
			user_id,
			public_key,
			counter,
			transports,
			device_type,
			backed_up
		)
		VALUES (
			${input.id},
			${input.userId},
			${Buffer.from(input.publicKey)},
			${input.counter},
			${input.transports ?? []},
			${input.deviceType ?? null},
			${input.backedUp ?? false}
		)
		RETURNING
			id,
			user_id,
			public_key,
			counter,
			transports,
			device_type,
			backed_up,
			created_at,
			last_used_at
	`;
	return rows[0];
}

export async function updateWebAuthnCredentialCounter(id: string, counter: number): Promise<void> {
	await ensureSchema();
	const db = getDb();
	await db`
		UPDATE webauthn_credentials
		SET counter = ${counter}, last_used_at = NOW()
		WHERE id = ${id}
	`;
}
