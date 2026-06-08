import { getDb, type InboxSession, type JsonObject } from '$lib/server/db';
import type { EmailDraftRecord, EmailDraftStatus, UserCloudflareEmailRecord } from './types';
import type { ParsedEncryptedEmailDraftPayload } from './validate';

/** Inbox summary ciphertext when no dedicated summary envelope is supplied. */
function encryptedSessionSummaryForInbox(payload: ParsedEncryptedEmailDraftPayload): JsonObject {
	return payload.encrypted_session_summary ?? payload.encrypted_to;
}

export async function getUserCloudflareEmail(
	userId: string
): Promise<UserCloudflareEmailRecord | null> {
	const db = getDb();
	const rows = await db<UserCloudflareEmailRecord[]>`
		SELECT user_id, account_id_ciphertext, api_token_ciphertext, created_at, updated_at
		FROM user_cloudflare_email
		WHERE user_id = ${userId}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function upsertUserCloudflareEmail(input: {
	userId: string;
	accountIdCiphertext: string;
	apiTokenCiphertext: string;
}): Promise<UserCloudflareEmailRecord> {
	const db = getDb();
	const rows = await db<UserCloudflareEmailRecord[]>`
		INSERT INTO user_cloudflare_email (user_id, account_id_ciphertext, api_token_ciphertext)
		VALUES (${input.userId}, ${input.accountIdCiphertext}, ${input.apiTokenCiphertext})
		ON CONFLICT (user_id) DO UPDATE
		SET
			account_id_ciphertext = EXCLUDED.account_id_ciphertext,
			api_token_ciphertext = EXCLUDED.api_token_ciphertext,
			updated_at = NOW()
		RETURNING user_id, account_id_ciphertext, api_token_ciphertext, created_at, updated_at
	`;
	return rows[0];
}

export async function deleteUserCloudflareEmail(userId: string): Promise<boolean> {
	const db = getDb();
	const rows = await db<{ user_id: string }[]>`
		DELETE FROM user_cloudflare_email
		WHERE user_id = ${userId}
		RETURNING user_id
	`;
	return rows.length > 0;
}

export async function getEmailDraftByIdempotencyKey(
	ownerUserId: string,
	idempotencyKey: string
): Promise<{ session: InboxSession; draft: EmailDraftRecord } | null> {
	const db = getDb();
	const rows = await db<
		Array<
			EmailDraftRecord & {
				session_id_join: string;
				owner_user_id_join: string | null;
				session_encryption_version: string;
				encrypted_title: JsonObject | null;
				encrypted_summary: JsonObject | null;
				read_at: Date | null;
				session_created_at: Date;
				session_updated_at: Date;
				is_read: boolean;
			}
		>
	>`
		SELECT
			d.*,
			s.id AS session_id_join,
			s.owner_user_id AS owner_user_id_join,
			s.encryption_version AS session_encryption_version,
			s.encrypted_title,
			s.encrypted_summary,
			s.read_at,
			s.created_at AS session_created_at,
			s.updated_at AS session_updated_at,
			(s.read_at IS NOT NULL) AS is_read
		FROM email_drafts d
		INNER JOIN inbox_sessions s ON s.id = d.session_id
		WHERE d.owner_user_id = ${ownerUserId}
			AND d.idempotency_key = ${idempotencyKey}
		LIMIT 1
	`;
	const row = rows[0];
	if (!row) return null;

	const draft: EmailDraftRecord = row;

	const session: InboxSession = {
		id: row.session_id_join,
		owner_user_id: row.owner_user_id_join,
		encryption_version: row.session_encryption_version,
		encrypted_title: row.encrypted_title,
		encrypted_summary: row.encrypted_summary,
		read_at: row.read_at,
		created_at: row.session_created_at,
		updated_at: row.session_updated_at,
		is_read: row.is_read
	};

	return { session, draft };
}

async function createEncryptedEmailDraft(input: {
	sessionId: string;
	draftId: string;
	ownerUserId: string;
	payload: ParsedEncryptedEmailDraftPayload;
}): Promise<{ session: InboxSession; draft: EmailDraftRecord }> {
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
				'email_draft',
				'e2ee-v1',
				${tx.json(payload.encrypted_subject)},
				${tx.json(encryptedSummary)}
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

		const draftRows = await tx<EmailDraftRecord[]>`
			INSERT INTO email_drafts (
				id,
				session_id,
				owner_user_id,
				encryption_version,
				encrypted_to,
				encrypted_from_email,
				encrypted_from_name,
				encrypted_subject,
				encrypted_html,
				encrypted_text,
				encrypted_metadata,
				idempotency_key
			)
			VALUES (
				${input.draftId},
				${input.sessionId},
				${input.ownerUserId},
				'e2ee-v1',
				${tx.json(payload.encrypted_to)},
				${tx.json(payload.encrypted_from_email)},
				${payload.encrypted_from_name ? tx.json(payload.encrypted_from_name) : null},
				${tx.json(payload.encrypted_subject)},
				${tx.json(payload.encrypted_html)},
				${payload.encrypted_text ? tx.json(payload.encrypted_text) : null},
				${payload.encrypted_metadata ? tx.json(payload.encrypted_metadata) : null},
				${payload.idempotency_key ?? null}
			)
			RETURNING *
		`;

		return { session: sessionRows[0], draft: draftRows[0] };
	});
}

export async function createEmailDraft(input: {
	sessionId: string;
	draftId: string;
	ownerUserId: string;
	payload: ParsedEncryptedEmailDraftPayload;
}): Promise<{ session: InboxSession; draft: EmailDraftRecord }> {
	return createEncryptedEmailDraft(input);
}

export async function getEmailDraftBySessionId(
	sessionId: string,
	ownerUserId: string
): Promise<EmailDraftRecord | null> {
	const db = getDb();
	const rows = await db<EmailDraftRecord[]>`
		SELECT *
		FROM email_drafts
		WHERE session_id = ${sessionId} AND owner_user_id = ${ownerUserId}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function getEmailDraftById(
	draftId: string,
	ownerUserId: string
): Promise<EmailDraftRecord | null> {
	const db = getDb();
	const rows = await db<EmailDraftRecord[]>`
		SELECT *
		FROM email_drafts
		WHERE id = ${draftId} AND owner_user_id = ${ownerUserId}
		LIMIT 1
	`;
	return rows[0] ?? null;
}

export async function transitionEmailDraftStatus(input: {
	draftId: string;
	ownerUserId: string;
	expectedStatus: EmailDraftStatus;
	nextStatus: EmailDraftStatus;
	reviewedAt?: Date | null;
	sentAt?: Date | null;
	sendError?: string | null;
}): Promise<EmailDraftRecord | null> {
	const db = getDb();
	const rows = await db<EmailDraftRecord[]>`
		UPDATE email_drafts
		SET
			status = ${input.nextStatus},
			reviewed_at = COALESCE(${input.reviewedAt ?? null}, reviewed_at),
			sent_at = COALESCE(${input.sentAt ?? null}, sent_at),
			send_error = ${input.sendError ?? null},
			updated_at = NOW()
		WHERE id = ${input.draftId}
			AND owner_user_id = ${input.ownerUserId}
			AND status = ${input.expectedStatus}
		RETURNING *
	`;
	return rows[0] ?? null;
}

export async function updateEmailDraftReview(input: {
	draftId: string;
	ownerUserId: string;
	encryptedReview: JsonObject | null;
}): Promise<EmailDraftRecord | null> {
	const db = getDb();
	const rows = await db<EmailDraftRecord[]>`
		UPDATE email_drafts
		SET
			encrypted_review = ${input.encryptedReview ? db.json(input.encryptedReview) : null},
			updated_at = NOW()
		WHERE id = ${input.draftId}
			AND owner_user_id = ${input.ownerUserId}
			AND status IN ('pending', 'failed')
		RETURNING *
	`;
	return rows[0] ?? null;
}

export async function saveEmailDraftSentSnapshot(input: {
	draftId: string;
	ownerUserId: string;
	encryptedSent: JsonObject | null;
}): Promise<EmailDraftRecord | null> {
	const db = getDb();
	const rows = await db<EmailDraftRecord[]>`
		UPDATE email_drafts
		SET
			encrypted_sent = ${input.encryptedSent ? db.json(input.encryptedSent) : null},
			encrypted_review = NULL,
			updated_at = NOW()
		WHERE id = ${input.draftId}
			AND owner_user_id = ${input.ownerUserId}
		RETURNING *
	`;
	return rows[0] ?? null;
}

export async function listEmailDraftSummariesForUser(
	ownerUserId: string
): Promise<Record<string, { status: EmailDraftStatus; encryption_version: string }>> {
	const db = getDb();
	const rows = await db<
		Array<{ session_id: string; status: EmailDraftStatus; encryption_version: string }>
	>`
		SELECT session_id, status, encryption_version
		FROM email_drafts
		WHERE owner_user_id = ${ownerUserId}
	`;
	const result: Record<string, { status: EmailDraftStatus; encryption_version: string }> = {};
	for (const row of rows) {
		result[row.session_id] = {
			status: row.status,
			encryption_version: row.encryption_version
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
