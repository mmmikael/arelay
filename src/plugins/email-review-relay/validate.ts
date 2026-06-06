import { normalizeEmail } from '$lib/server/email-verification';
import type { JsonObject } from '$lib/server/db';
import type {
	EmailDraftPayload,
	EmailDraftSendFields,
	EncryptedEmailDraftPayload
} from './types';

const MAX_SUBJECT_LENGTH = 500;
const MAX_HTML_LENGTH = 256 * 1024;
const MAX_TEXT_LENGTH = 256 * 1024;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_ENCRYPTED_FIELD_LENGTH = 512 * 1024;

export type ParsedEmailDraftPayload = EmailDraftPayload;
export type ParsedEncryptedEmailDraftPayload = EncryptedEmailDraftPayload;

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEncryptedEnvelope(value: unknown): value is JsonObject {
	if (!isJsonObject(value)) return false;
	const record = value as Record<string, unknown>;
	return (
		record.v === 1 &&
		record.alg === 'P-256-ECDH-A256GCM' &&
		isJsonObject(record.epk) &&
		typeof record.iv === 'string' &&
		typeof record.ciphertext === 'string' &&
		record.iv.length > 0 &&
		record.ciphertext.length > 0 &&
		record.ciphertext.length <= MAX_ENCRYPTED_FIELD_LENGTH
	);
}

function parseIdempotencyKey(record: Record<string, unknown>):
	| { ok: true; value?: string }
	| { ok: false; error: string } {
	if (record.idempotency_key === undefined) {
		return { ok: true };
	}
	if (typeof record.idempotency_key !== 'string' || !record.idempotency_key.trim()) {
		return { ok: false, error: 'idempotency_key must be a non-empty string when provided' };
	}
	return {
		ok: true,
		value: record.idempotency_key.trim().slice(0, MAX_IDEMPOTENCY_KEY_LENGTH)
	};
}

function requireEncryptedField(
	record: Record<string, unknown>,
	field: string
): { ok: true; value: JsonObject } | { ok: false; error: string } {
	const value = record[field];
	if (!isEncryptedEnvelope(value)) {
		return { ok: false, error: `${field} envelope required` };
	}
	return { ok: true, value };
}

function optionalEncryptedField(
	record: Record<string, unknown>,
	field: string
): { ok: true; value?: JsonObject } | { ok: false; error: string } {
	const value = record[field];
	if (value === undefined) {
		return { ok: true };
	}
	if (!isEncryptedEnvelope(value)) {
		return { ok: false, error: `${field} must be a valid envelope when provided` };
	}
	return { ok: true, value };
}

function parsePlaintextEmailFields(record: Record<string, unknown>):
	| { ok: true; value: EmailDraftSendFields }
	| { ok: false; error: string } {
	const to = normalizeEmail(record.to);
	if (!to) {
		return { ok: false, error: 'Valid to address required' };
	}

	const fromRaw = record.from;
	if (!fromRaw || typeof fromRaw !== 'object') {
		return { ok: false, error: 'from object with email required' };
	}
	const fromRecord = fromRaw as Record<string, unknown>;
	const fromEmail = normalizeEmail(fromRecord.email);
	if (!fromEmail) {
		return { ok: false, error: 'Valid from.email required' };
	}
	const fromName =
		typeof fromRecord.name === 'string' && fromRecord.name.trim()
			? fromRecord.name.trim().slice(0, 200)
			: undefined;

	const subject = typeof record.subject === 'string' ? record.subject.trim() : '';
	if (!subject) {
		return { ok: false, error: 'subject required' };
	}
	if (subject.length > MAX_SUBJECT_LENGTH) {
		return { ok: false, error: `subject must be at most ${MAX_SUBJECT_LENGTH} characters` };
	}

	const html = typeof record.html === 'string' ? record.html : '';
	if (!html.trim()) {
		return { ok: false, error: 'html required' };
	}
	if (html.length > MAX_HTML_LENGTH) {
		return { ok: false, error: `html must be at most ${MAX_HTML_LENGTH} characters` };
	}

	const text =
		typeof record.text === 'string' && record.text.trim()
			? record.text.slice(0, MAX_TEXT_LENGTH)
			: undefined;

	return {
		ok: true,
		value: {
			to,
			from: { email: fromEmail, name: fromName },
			subject,
			html,
			text
		}
	};
}

export function parseEmailDraftPayload(body: unknown):
	| { ok: true; value: ParsedEmailDraftPayload }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}

	const record = body as Record<string, unknown>;
	if (record.encrypted === true) {
		return { ok: false, error: 'Use encrypted email draft fields when encrypted is true' };
	}

	const core = parsePlaintextEmailFields(record);
	if (!core.ok) return core;

	let metadata: JsonObject | undefined;
	if (record.metadata !== undefined) {
		if (!isJsonObject(record.metadata)) {
			return { ok: false, error: 'metadata must be an object when provided' };
		}
		metadata = record.metadata;
	}

	const idempotency = parseIdempotencyKey(record);
	if (!idempotency.ok) return idempotency;

	return {
		ok: true,
		value: {
			...core.value,
			metadata,
			idempotency_key: idempotency.value
		}
	};
}

export function parseEncryptedEmailDraftPayload(body: unknown):
	| { ok: true; value: ParsedEncryptedEmailDraftPayload }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}

	const record = body as Record<string, unknown>;
	if (record.encrypted !== true) {
		return { ok: false, error: 'encrypted must be true for encrypted email drafts' };
	}

	const encryptedTo = requireEncryptedField(record, 'encrypted_to');
	if (!encryptedTo.ok) return encryptedTo;
	const encryptedFromEmail = requireEncryptedField(record, 'encrypted_from_email');
	if (!encryptedFromEmail.ok) return encryptedFromEmail;
	const encryptedSubject = requireEncryptedField(record, 'encrypted_subject');
	if (!encryptedSubject.ok) return encryptedSubject;
	const encryptedHtml = requireEncryptedField(record, 'encrypted_html');
	if (!encryptedHtml.ok) return encryptedHtml;

	const encryptedFromName = optionalEncryptedField(record, 'encrypted_from_name');
	if (!encryptedFromName.ok) return encryptedFromName;
	const encryptedText = optionalEncryptedField(record, 'encrypted_text');
	if (!encryptedText.ok) return encryptedText;
	const encryptedMetadata = optionalEncryptedField(record, 'encrypted_metadata');
	if (!encryptedMetadata.ok) return encryptedMetadata;
	const encryptedSessionSummary = optionalEncryptedField(record, 'encrypted_session_summary');
	if (!encryptedSessionSummary.ok) return encryptedSessionSummary;

	const idempotency = parseIdempotencyKey(record);
	if (!idempotency.ok) return idempotency;

	return {
		ok: true,
		value: {
			encrypted_to: encryptedTo.value,
			encrypted_from_email: encryptedFromEmail.value,
			encrypted_from_name: encryptedFromName.value,
			encrypted_subject: encryptedSubject.value,
			encrypted_html: encryptedHtml.value,
			encrypted_text: encryptedText.value,
			encrypted_metadata: encryptedMetadata.value,
			encrypted_session_summary: encryptedSessionSummary.value,
			idempotency_key: idempotency.value
		}
	};
}

export function parseEmailDraftSendFields(body: unknown):
	| { ok: true; value: EmailDraftSendFields }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}

	return parsePlaintextEmailFields(body as Record<string, unknown>);
}

export function parseEmailDraftBody(body: unknown):
	| { ok: true; encrypted: false; value: ParsedEmailDraftPayload }
	| { ok: true; encrypted: true; value: ParsedEncryptedEmailDraftPayload }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}

	const record = body as Record<string, unknown>;
	if (record.encrypted === true) {
		const parsed = parseEncryptedEmailDraftPayload(body);
		if (!parsed.ok) return parsed;
		return { ok: true, encrypted: true, value: parsed.value };
	}

	const parsed = parseEmailDraftPayload(body);
	if (!parsed.ok) return parsed;
	return { ok: true, encrypted: false, value: parsed.value };
}
