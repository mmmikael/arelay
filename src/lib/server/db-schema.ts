import { sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType() {
		return 'bytea';
	}
});

export const users = pgTable('users', {
	id: uuid('id').primaryKey(),
	email: text('email').notNull().unique(),
	displayName: text('display_name'),
	termsVersion: text('terms_version'),
	privacyVersion: text('privacy_version'),
	legalAcceptedAt: timestamp('legal_accepted_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const emailVerificationChallenges = pgTable(
	'email_verification_challenges',
	{
		id: uuid('id').primaryKey(),
		email: text('email').notNull(),
		displayName: text('display_name'),
		codeHash: text('code_hash').notNull(),
		signupTokenHash: text('signup_token_hash'),
		attempts: integer('attempts').default(0).notNull(),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
		verifiedAt: timestamp('verified_at', { withTimezone: true }),
		consumedAt: timestamp('consumed_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('idx_email_verification_challenges_email_created_at').on(
			table.email,
			table.createdAt.desc()
		),
		uniqueIndex('idx_email_verification_challenges_signup_token_hash')
			.on(table.signupTokenHash)
			.where(sql`${table.signupTokenHash} IS NOT NULL`)
	]
);

export const agentApiTokens = pgTable(
	'agent_api_tokens',
	{
		id: uuid('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		tokenHash: text('token_hash').notNull(),
		encryptedToken: jsonb('encrypted_token').$type<JsonObject>(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
		revokedAt: timestamp('revoked_at', { withTimezone: true })
	},
	(table) => [
		index('idx_agent_api_tokens_user_id').on(table.userId),
		index('idx_agent_api_tokens_user_active')
			.on(table.userId, table.createdAt.desc())
			.where(sql`${table.revokedAt} IS NULL`),
		uniqueIndex('idx_agent_api_tokens_token_hash').on(table.tokenHash)
	]
);

export const inboxSessions = pgTable(
	'inbox_sessions',
	{
		id: uuid('id').primaryKey(),
		ownerUserId: uuid('owner_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		deliveryType: text('delivery_type').default('generic').notNull(),
		encryptionVersion: text('encryption_version').default('e2ee-v1').notNull(),
		encryptedTitle: jsonb('encrypted_title').$type<JsonObject>(),
		encryptedSummary: jsonb('encrypted_summary').$type<JsonObject>(),
		readAt: timestamp('read_at', { withTimezone: true }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('idx_inbox_sessions_owner_user_id').on(table.ownerUserId),
		index('idx_inbox_sessions_updated_at').on(table.updatedAt.desc())
	]
);

export const inboxArtifacts = pgTable(
	'inbox_artifacts',
	{
		id: uuid('id').primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.references(() => inboxSessions.id, { onDelete: 'cascade' }),
		filename: text('filename').notNull(),
		contentType: text('content_type').default('application/octet-stream').notNull(),
		encryptionVersion: text('encryption_version').default('e2ee-v1').notNull(),
		encryptedFilename: jsonb('encrypted_filename').$type<JsonObject>(),
		encryptedContentType: jsonb('encrypted_content_type').$type<JsonObject>(),
		encryptedPayload: jsonb('encrypted_payload').$type<JsonObject>(),
		sizeBytes: bigint('size_bytes', { mode: 'number' }).default(0).notNull(),
		storageKey: text('storage_key').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [index('idx_inbox_artifacts_session_id').on(table.sessionId)]
);

export const e2eeConfig = pgTable(
	'e2ee_config',
	{
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		publicKeyJwk: jsonb('public_key_jwk').$type<JsonObject>().notNull(),
		encryptedPrivateKey: jsonb('encrypted_private_key').$type<JsonObject>().notNull(),
		passkeyCredentialId: text('passkey_credential_id'),
		passkeyEncryptedPrivateKey: jsonb('passkey_encrypted_private_key').$type<JsonObject>(),
		recoveryHint: text('recovery_hint'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [uniqueIndex('idx_e2ee_config_user_id').on(table.userId)]
);

export const webauthnCredentials = pgTable(
	'webauthn_credentials',
	{
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		publicKey: bytea('public_key').notNull(),
		counter: bigint('counter', { mode: 'number' }).default(0).notNull(),
		transports: text('transports').array().default(sql`'{}'::text[]`).notNull(),
		deviceType: text('device_type'),
		backedUp: boolean('backed_up').default(false).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		lastUsedAt: timestamp('last_used_at', { withTimezone: true })
	},
	(table) => [index('idx_webauthn_credentials_user_id').on(table.userId)]
);
