import type { JsonObject } from '$lib/server/db';

export type EmailDraftStatus = 'pending' | 'approved' | 'rejected' | 'sent' | 'failed';

export type EmailDraftRecord = {
	id: string;
	session_id: string;
	owner_user_id: string;
	encryption_version: string;
	to_address: string | null;
	from_email: string | null;
	from_name: string | null;
	subject: string | null;
	html: string | null;
	text: string | null;
	metadata: JsonObject | null;
	encrypted_to: JsonObject | null;
	encrypted_from_email: JsonObject | null;
	encrypted_from_name: JsonObject | null;
	encrypted_subject: JsonObject | null;
	encrypted_html: JsonObject | null;
	encrypted_text: JsonObject | null;
	encrypted_metadata: JsonObject | null;
	idempotency_key: string | null;
	status: EmailDraftStatus;
	reviewed_at: Date | null;
	sent_at: Date | null;
	send_error: string | null;
	created_at: Date;
	updated_at: Date;
};

export type UserCloudflareEmailRecord = {
	user_id: string;
	account_id: string;
	api_token_ciphertext: string;
	created_at: Date;
	updated_at: Date;
};

export type EmailDraftPayload = {
	to: string;
	from: { email: string; name?: string };
	subject: string;
	html: string;
	text?: string;
	metadata?: JsonObject;
	idempotency_key?: string;
};

export type EncryptedEmailDraftPayload = {
	encrypted_to: JsonObject;
	encrypted_from_email: JsonObject;
	encrypted_from_name?: JsonObject;
	encrypted_subject: JsonObject;
	encrypted_html: JsonObject;
	encrypted_text?: JsonObject;
	encrypted_metadata?: JsonObject;
	encrypted_session_summary?: JsonObject;
	idempotency_key?: string;
};

export type EmailDraftSendFields = {
	to: string;
	from: { email: string; name?: string };
	subject: string;
	html: string;
	text?: string;
};

export function isEncryptedEmailDraft(draft: EmailDraftRecord): boolean {
	return draft.encryption_version === 'e2ee-v1';
}

export function toAgentEmailDraftView(draft: EmailDraftRecord) {
	const base = {
		id: draft.id,
		session_id: draft.session_id,
		encryption_version: draft.encryption_version,
		status: draft.status,
		reviewed_at: draft.reviewed_at,
		sent_at: draft.sent_at,
		send_error: draft.send_error
	};

	if (isEncryptedEmailDraft(draft)) {
		return base;
	}

	return {
		...base,
		subject: draft.subject,
		to_address: draft.to_address,
		from_email: draft.from_email,
		from_name: draft.from_name,
		metadata: draft.metadata
	};
}
