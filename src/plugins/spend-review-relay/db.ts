import { getDb, type InboxSession, type JsonObject } from '$lib/server/db';
import type { SpendRequestRecord, SpendRequestStatus, UserStripeCredentialsRecord } from './types';
import type { ParsedEncryptedSpendRequestPayload } from './validate';

/** Inbox summary ciphertext when no dedicated summary envelope is supplied. */
function encryptedSessionSummaryForInbox(payload: ParsedEncryptedSpendRequestPayload): JsonObject {
	return payload.encrypted_session_summary ?? payload.encrypted_payee;
}

export async function getUserStripeCredentials(
	userId: string
): Promise<UserStripeCredentialsRecord | null> {
	const db = getDb();
	const rows = await db<UserStripeCredentialsRecord[]>`
		SELECT user_id, secret_key_ciphertext, created_at, updated_at
		FROM user_stripe_credentials
		WHERE user_id = ${userId}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function upsertUserStripeCredentials(input: {
	userId: string;
	secretKeyCiphertext: string;
}): Promise<UserStripeCredentialsRecord> {
	const db = getDb();
	const rows = await db<UserStripeCredentialsRecord[]>`
		INSERT INTO user_stripe_credentials (user_id, secret_key_ciphertext)
		VALUES (${input.userId}, ${input.secretKeyCiphertext})
		ON CONFLICT (user_id) DO UPDATE
		SET
			secret_key_ciphertext = EXCLUDED.secret_key_ciphertext,
			updated_at = NOW()
		RETURNING user_id, secret_key_ciphertext, created_at, updated_at
	`;
	return rows[0];
}

export async function deleteUserStripeCredentials(userId: string): Promise<boolean> {
	const db = getDb();
	const rows = await db<{ user_id: string }[]>`
		DELETE FROM user_stripe_credentials
		WHERE user_id = ${userId}
		RETURNING user_id
	`;
	return rows.length > 0;
}

export async function getSpendRequestByIdempotencyKey(
	ownerUserId: string,
	idempotencyKey: string
): Promise<{ session: InboxSession; request: SpendRequestRecord } | null> {
	const db = getDb();
	const rows = await db<
		Array<
			SpendRequestRecord & {
				session_id_join: string;
				owner_user_id_join: string | null;
				session_encryption_version: string;
				encrypted_title: JsonObject | null;
				encrypted_summary: JsonObject | null;
				read_at: Date | null;
				archived_at: Date | null;
				session_created_at: Date;
				session_updated_at: Date;
				is_read: boolean;
				is_archived: boolean;
			}
		>
	>`
		SELECT
			r.*,
			s.id AS session_id_join,
			s.owner_user_id AS owner_user_id_join,
			s.encryption_version AS session_encryption_version,
			s.encrypted_title,
			s.encrypted_summary,
			s.read_at,
			s.archived_at,
			s.created_at AS session_created_at,
			s.updated_at AS session_updated_at,
			(s.read_at IS NOT NULL) AS is_read,
			(s.archived_at IS NOT NULL) AS is_archived
		FROM spend_requests r
		INNER JOIN inbox_sessions s ON s.id = r.session_id
		WHERE r.owner_user_id = ${ownerUserId}
			AND r.idempotency_key = ${idempotencyKey}
		LIMIT 1
	`;
	const row = rows[0];
	if (!row) return null;

	const request: SpendRequestRecord = row;

	const session: InboxSession = {
		id: row.session_id_join,
		owner_user_id: row.owner_user_id_join,
		encryption_version: row.session_encryption_version,
		encrypted_title: row.encrypted_title,
		encrypted_summary: row.encrypted_summary,
		read_at: row.read_at,
		archived_at: row.archived_at,
		created_at: row.session_created_at,
		updated_at: row.session_updated_at,
		is_read: row.is_read,
		is_archived: row.is_archived
	};

	return { session, request };
}

export async function createSpendRequest(input: {
	sessionId: string;
	requestId: string;
	ownerUserId: string;
	payload: ParsedEncryptedSpendRequestPayload;
}): Promise<{ session: InboxSession; request: SpendRequestRecord }> {
	const db = getDb();
	const payload = input.payload;
	const encryptedSummary = encryptedSessionSummaryForInbox(payload);

	return await db.begin(async (tx) => {
		const sessionRows = await tx<InboxSession[]>`
			INSERT INTO inbox_sessions (
				id,
				owner_user_id,
				delivery_type,
				encryption_version,
				encrypted_title,
				encrypted_summary
			)
			VALUES (
				${input.sessionId},
				${input.ownerUserId},
				'spend_request',
				'e2ee-v1',
				${tx.json(payload.encrypted_description)},
				${tx.json(encryptedSummary)}
			)
			RETURNING
				id,
				owner_user_id,
				encryption_version,
				encrypted_title,
				encrypted_summary,
				read_at,
				archived_at,
				created_at,
				updated_at,
				(read_at IS NOT NULL) AS is_read,
				(archived_at IS NOT NULL) AS is_archived
		`;

		const requestRows = await tx<SpendRequestRecord[]>`
			INSERT INTO spend_requests (
				id,
				session_id,
				owner_user_id,
				encryption_version,
				encrypted_payee,
				encrypted_amount,
				encrypted_currency,
				encrypted_description,
				encrypted_metadata,
				idempotency_key
			)
			VALUES (
				${input.requestId},
				${input.sessionId},
				${input.ownerUserId},
				'e2ee-v1',
				${tx.json(payload.encrypted_payee)},
				${tx.json(payload.encrypted_amount)},
				${tx.json(payload.encrypted_currency)},
				${tx.json(payload.encrypted_description)},
				${payload.encrypted_metadata ? tx.json(payload.encrypted_metadata) : null},
				${payload.idempotency_key ?? null}
			)
			RETURNING *
		`;

		return { session: sessionRows[0], request: requestRows[0] };
	});
}

export async function getSpendRequestBySessionId(
	sessionId: string,
	ownerUserId: string
): Promise<SpendRequestRecord | null> {
	const db = getDb();
	const rows = await db<SpendRequestRecord[]>`
		SELECT *
		FROM spend_requests
		WHERE session_id = ${sessionId} AND owner_user_id = ${ownerUserId}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function getSpendRequestById(
	requestId: string,
	ownerUserId: string
): Promise<SpendRequestRecord | null> {
	const db = getDb();
	const rows = await db<SpendRequestRecord[]>`
		SELECT *
		FROM spend_requests
		WHERE id = ${requestId} AND owner_user_id = ${ownerUserId}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function transitionSpendRequestStatus(input: {
	requestId: string;
	ownerUserId: string;
	expectedStatus: SpendRequestStatus;
	nextStatus: SpendRequestStatus;
	reviewedAt?: Date | null;
	paidAt?: Date | null;
	paymentIntentId?: string | null;
	chargeError?: string | null;
}): Promise<SpendRequestRecord | null> {
	const db = getDb();
	const rows = await db<SpendRequestRecord[]>`
		UPDATE spend_requests
		SET
			status = ${input.nextStatus},
			reviewed_at = COALESCE(${input.reviewedAt ?? null}, reviewed_at),
			paid_at = COALESCE(${input.paidAt ?? null}, paid_at),
			payment_intent_id = COALESCE(${input.paymentIntentId ?? null}, payment_intent_id),
			charge_error = ${input.chargeError ?? null},
			updated_at = NOW()
		WHERE id = ${input.requestId}
			AND owner_user_id = ${input.ownerUserId}
			AND status = ${input.expectedStatus}
		RETURNING *
	`;
	return rows[0] ?? null;
}

export async function saveSpendRequestReceipt(input: {
	requestId: string;
	ownerUserId: string;
	encryptedReceipt: JsonObject | null;
}): Promise<SpendRequestRecord | null> {
	const db = getDb();
	const rows = await db<SpendRequestRecord[]>`
		UPDATE spend_requests
		SET
			encrypted_receipt = ${input.encryptedReceipt ? db.json(input.encryptedReceipt) : null},
			updated_at = NOW()
		WHERE id = ${input.requestId}
			AND owner_user_id = ${input.ownerUserId}
		RETURNING *
	`;
	return rows[0] ?? null;
}

export async function getSpendRequestStats(ownerUserId: string): Promise<{
	requestCount: number;
	latestUpdatedAt: Date | null;
}> {
	const db = getDb();
	const rows = await db<{ request_count: number; latest_updated_at: Date | null }[]>`
		SELECT COUNT(*)::int AS request_count, MAX(updated_at) AS latest_updated_at
		FROM spend_requests
		WHERE owner_user_id = ${ownerUserId}
	`;
	const row = rows[0];
	return {
		requestCount: Number(row?.request_count ?? 0),
		latestUpdatedAt: row?.latest_updated_at ?? null
	};
}

export async function listSpendRequestSummariesForUser(
	ownerUserId: string
): Promise<
	Record<string, { status: SpendRequestStatus; encryption_version: string; updated_at: Date }>
> {
	const db = getDb();
	const rows = await db<
		Array<{
			session_id: string;
			status: SpendRequestStatus;
			encryption_version: string;
			updated_at: Date;
		}>
	>`
		SELECT session_id, status, encryption_version, updated_at
		FROM spend_requests
		WHERE owner_user_id = ${ownerUserId}
	`;
	const result: Record<
		string,
		{ status: SpendRequestStatus; encryption_version: string; updated_at: Date }
	> = {};
	for (const row of rows) {
		result[row.session_id] = {
			status: row.status,
			encryption_version: row.encryption_version,
			updated_at: row.updated_at
		};
	}
	return result;
}

export async function getSessionDeliveryType(
	sessionId: string,
	ownerUserId: string
): Promise<string | null> {
	const db = getDb();
	const rows = await db<Array<{ delivery_type: string }>>`
		SELECT delivery_type
		FROM inbox_sessions
		WHERE id = ${sessionId} AND owner_user_id = ${ownerUserId}
		LIMIT 1
	`;
	return rows[0]?.delivery_type ?? null;
}
