import { sql } from 'drizzle-orm';
import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { inboxSessions, type JsonObject, users } from '../../lib/server/db-schema';

export const userCloudflareEmail = pgTable('user_cloudflare_email', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	accountIdCiphertext: text('account_id_ciphertext').notNull(),
	apiTokenCiphertext: text('api_token_ciphertext').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const emailDrafts = pgTable(
	'email_drafts',
	{
		id: uuid('id').primaryKey(),
		sessionId: uuid('session_id')
			.notNull()
			.unique()
			.references(() => inboxSessions.id, { onDelete: 'cascade' }),
		ownerUserId: uuid('owner_user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		encryptionVersion: text('encryption_version').default('e2ee-v1').notNull(),
		encryptedTo: jsonb('encrypted_to').$type<JsonObject>().notNull(),
		encryptedFromEmail: jsonb('encrypted_from_email').$type<JsonObject>().notNull(),
		encryptedFromName: jsonb('encrypted_from_name').$type<JsonObject>(),
		encryptedSubject: jsonb('encrypted_subject').$type<JsonObject>().notNull(),
		encryptedHtml: jsonb('encrypted_html').$type<JsonObject>().notNull(),
		encryptedText: jsonb('encrypted_text').$type<JsonObject>(),
		encryptedMetadata: jsonb('encrypted_metadata').$type<JsonObject>(),
		encryptedReview: jsonb('encrypted_review').$type<JsonObject>(),
		encryptedSent: jsonb('encrypted_sent').$type<JsonObject>(),
		idempotencyKey: text('idempotency_key'),
		status: text('status').default('pending').notNull(),
		reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
		sentAt: timestamp('sent_at', { withTimezone: true }),
		sendError: text('send_error'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('idx_email_drafts_idempotency')
			.on(table.ownerUserId, table.idempotencyKey)
			.where(sql`${table.idempotencyKey} IS NOT NULL`),
		index('idx_email_drafts_session_id').on(table.sessionId),
		index('idx_email_drafts_owner_status').on(table.ownerUserId, table.status)
	]
);
