import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { inboxSessions, type JsonObject, users } from '../../lib/server/db-schema';

export const userStripeCredentials = pgTable('user_stripe_credentials', {
	userId: uuid('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	secretKeyCiphertext: text('secret_key_ciphertext').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});

export const spendRequests = pgTable(
	'spend_requests',
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
		encryptedPayee: jsonb('encrypted_payee').$type<JsonObject>().notNull(),
		encryptedAmount: jsonb('encrypted_amount').$type<JsonObject>().notNull(),
		encryptedCurrency: jsonb('encrypted_currency').$type<JsonObject>().notNull(),
		encryptedDescription: jsonb('encrypted_description').$type<JsonObject>().notNull(),
		encryptedMetadata: jsonb('encrypted_metadata').$type<JsonObject>(),
		encryptedReceipt: jsonb('encrypted_receipt').$type<JsonObject>(),
		idempotencyKey: text('idempotency_key'),
		status: text('status').default('pending').notNull(),
		paymentIntentId: text('payment_intent_id'),
		reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
		paidAt: timestamp('paid_at', { withTimezone: true }),
		chargeError: text('charge_error'),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('idx_spend_requests_idempotency')
			.on(table.ownerUserId, table.idempotencyKey)
			.where(sql`${table.idempotencyKey} IS NOT NULL`),
		index('idx_spend_requests_session_id').on(table.sessionId),
		index('idx_spend_requests_owner_status').on(table.ownerUserId, table.status)
	]
);
