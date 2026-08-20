import { isEncryptedEnvelope, MAX_ENCRYPTED_FIELD_LENGTH } from '$lib/e2ee-envelope';
import { normalizeEmail } from '$lib/server/email-verification';
import type { JsonObject } from '$lib/server/db';
import type { EmailDraftApproveFields, EmailDraftSendFields, EncryptedEmailDraftPayload } from './types';

const MAX_SUBJECT_LENGTH = 500;
const MAX_HTML_LENGTH = 256 * 1024;
const MAX_TEXT_LENGTH = 256 * 1024;
const MAX_IDEMPOTENCY_KEY_LENGTH = 200;
const MAX_RECIPIENTS = 50;
const MAX_INLINE_ATTACHMENTS = 20;
const MAX_INLINE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_INLINE_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024;
// Inline images travel inside the html as base64 data URIs until approve time, so the
// encrypted html (and the review/sent bundles that carry the same html) can legitimately
// reach ~18 MB of base64url ciphertext: 10 MB of decoded images × 4/3 (data URI) × 4/3
// (ciphertext encoding), plus the 256 KB html budget. Other fields keep the default cap.
const MAX_ENCRYPTED_BODY_LENGTH = 20 * 1024 * 1024;
const ALLOWED_INLINE_IMAGE_TYPES = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp'
]);
const BASE64_PATTERN = /^[a-z0-9+/]*={0,2}$/i;
const CONTENT_ID_PATTERN = /^[a-z0-9._-]{1,200}$/i;

export type ParsedEncryptedEmailDraftPayload = EncryptedEmailDraftPayload;

export { isEncryptedEnvelope };

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

function envelopeTooLargeError(field: string, maxLength: number): string {
	return (
		`${field} payload too large: the encrypted ciphertext exceeds ` +
		`${Math.floor(maxLength / (1024 * 1024))} MB. Reduce inline image size or count.`
	);
}

function requireEncryptedField(
	record: Record<string, unknown>,
	field: string,
	maxLength: number = MAX_ENCRYPTED_FIELD_LENGTH
): { ok: true; value: JsonObject } | { ok: false; error: string } {
	const value = record[field];
	if (!isEncryptedEnvelope(value, maxLength)) {
		if (isEncryptedEnvelope(value, Number.POSITIVE_INFINITY)) {
			return { ok: false, error: envelopeTooLargeError(field, maxLength) };
		}
		return { ok: false, error: `${field} envelope required` };
	}
	return { ok: true, value };
}

function optionalEncryptedField(
	record: Record<string, unknown>,
	field: string,
	maxLength: number = MAX_ENCRYPTED_FIELD_LENGTH
): { ok: true; value?: JsonObject } | { ok: false; error: string } {
	const value = record[field];
	if (value === undefined) {
		return { ok: true };
	}
	if (!isEncryptedEnvelope(value, maxLength)) {
		if (isEncryptedEnvelope(value, Number.POSITIVE_INFINITY)) {
			return { ok: false, error: envelopeTooLargeError(field, maxLength) };
		}
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

	const cc = parseOptionalRecipients(record.cc, 'cc');
	if (!cc.ok) return cc;
	const bcc = parseOptionalRecipients(record.bcc, 'bcc');
	if (!bcc.ok) return bcc;
	if (1 + cc.value.length + bcc.value.length > MAX_RECIPIENTS) {
		return {
			ok: false,
			error: `to, cc, and bcc may contain at most ${MAX_RECIPIENTS} recipients combined`
		};
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
	const attachments = parseInlineAttachments(record.attachments);
	if (!attachments.ok) return attachments;

	return {
		ok: true,
		value: {
			to,
			cc: cc.value.length ? cc.value : undefined,
			bcc: bcc.value.length ? bcc.value : undefined,
			from: { email: fromEmail, name: fromName },
			subject,
			html,
			text,
			attachments: attachments.value.length ? attachments.value : undefined
		}
	};
}

function decodedBase64Size(content: string): number {
	const padding = content.endsWith('==') ? 2 : content.endsWith('=') ? 1 : 0;
	return Math.floor((content.length * 3) / 4) - padding;
}

function parseInlineAttachments(
	value: unknown
):
	| { ok: true; value: NonNullable<EmailDraftSendFields['attachments']> }
	| { ok: false; error: string } {
	if (value === undefined) return { ok: true, value: [] };
	if (!Array.isArray(value) || value.length > MAX_INLINE_ATTACHMENTS) {
		return {
			ok: false,
			error: `attachments must be an array with at most ${MAX_INLINE_ATTACHMENTS} items`
		};
	}

	const attachments: NonNullable<EmailDraftSendFields['attachments']> = [];
	let totalBytes = 0;
	for (const [index, item] of value.entries()) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			return { ok: false, error: `attachments[${index}] must be an object` };
		}
		const record = item as Record<string, unknown>;
		const content = typeof record.content === 'string' ? record.content.replace(/\s+/g, '') : '';
		const filename = typeof record.filename === 'string' ? record.filename.trim() : '';
		const type = typeof record.type === 'string' ? record.type.toLowerCase() : '';
		const contentId = typeof record.content_id === 'string' ? record.content_id.trim() : '';
		if (
			!content ||
			!BASE64_PATTERN.test(content) ||
			content.length % 4 !== 0 ||
			!filename ||
			filename.length > 255 ||
			record.disposition !== 'inline' ||
			!ALLOWED_INLINE_IMAGE_TYPES.has(type) ||
			!CONTENT_ID_PATTERN.test(contentId)
		) {
			return { ok: false, error: `attachments[${index}] is not a valid inline image` };
		}

		const size = decodedBase64Size(content);
		if (size > MAX_INLINE_ATTACHMENT_BYTES) {
			return {
				ok: false,
				error: `attachments[${index}] exceeds ${MAX_INLINE_ATTACHMENT_BYTES} bytes`
			};
		}
		totalBytes += size;
		if (totalBytes > MAX_INLINE_ATTACHMENTS_TOTAL_BYTES) {
			return {
				ok: false,
				error: `attachments exceed ${MAX_INLINE_ATTACHMENTS_TOTAL_BYTES} bytes combined`
			};
		}
		attachments.push({
			content,
			filename,
			type,
			disposition: 'inline',
			content_id: contentId
		});
	}
	return { ok: true, value: attachments };
}

function parseOptionalRecipients(
	value: unknown,
	field: 'cc' | 'bcc'
): { ok: true; value: string[] } | { ok: false; error: string } {
	if (value === undefined) return { ok: true, value: [] };

	const rawRecipients = typeof value === 'string' ? [value] : value;
	if (!Array.isArray(rawRecipients)) {
		return { ok: false, error: `${field} must be an email address or array of email addresses` };
	}

	const recipients: string[] = [];
	for (const recipient of rawRecipients) {
		const normalized = normalizeEmail(recipient);
		if (!normalized) {
			return { ok: false, error: `Valid ${field} addresses required` };
		}
		recipients.push(normalized);
	}
	return { ok: true, value: recipients };
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
	const encryptedHtml = requireEncryptedField(record, 'encrypted_html', MAX_ENCRYPTED_BODY_LENGTH);
	if (!encryptedHtml.ok) return encryptedHtml;

	const encryptedCc = optionalEncryptedField(record, 'encrypted_cc');
	if (!encryptedCc.ok) return encryptedCc;
	const encryptedBcc = optionalEncryptedField(record, 'encrypted_bcc');
	if (!encryptedBcc.ok) return encryptedBcc;
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
			encrypted_cc: encryptedCc.value,
			encrypted_bcc: encryptedBcc.value,
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

export function parseEmailDraftApproveFields(body: unknown):
	| { ok: true; value: EmailDraftApproveFields }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}

	const record = body as Record<string, unknown>;
	const parsed = parsePlaintextEmailFields(record);
	if (!parsed.ok) return parsed;

	const encryptedSent = optionalEncryptedField(record, 'encrypted_sent', MAX_ENCRYPTED_BODY_LENGTH);
	if (!encryptedSent.ok) return encryptedSent;

	return {
		ok: true,
		value: {
			...parsed.value,
			encrypted_sent: encryptedSent.value
		}
	};
}

export function parseEmailDraftReviewBody(body: unknown):
	| { ok: true; value: { encrypted_review: JsonObject | null } }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}

	const record = body as Record<string, unknown>;
	if (record.encrypted !== true) {
		return { ok: false, error: 'encrypted must be true' };
	}

	if (record.encrypted_review === null) {
		return { ok: true, value: { encrypted_review: null } };
	}

	const encryptedReview = requireEncryptedField(record, 'encrypted_review', MAX_ENCRYPTED_BODY_LENGTH);
	if (!encryptedReview.ok) return encryptedReview;

	return {
		ok: true,
		value: { encrypted_review: encryptedReview.value }
	};
}

export function parseEmailDraftBody(body: unknown):
	| { ok: true; value: ParsedEncryptedEmailDraftPayload }
	| { ok: false; error: string } {
	if (!body || typeof body !== 'object') {
		return { ok: false, error: 'JSON body required' };
	}

	const record = body as Record<string, unknown>;
	if (record.encrypted !== true) {
		return {
			ok: false,
			error: 'encrypted must be true; plaintext email drafts are not allowed'
		};
	}

	const parsed = parseEncryptedEmailDraftPayload(body);
	if (!parsed.ok) return parsed;
	return { ok: true, value: parsed.value };
}
