import { decryptString, type EncryptedEnvelope } from '$lib/e2ee';
import {
	agentFieldsToBundle,
	emailDraftDisplayBundle,
	parseEmailDraftBundleJson,
	type EmailDraftAgentFields,
	type EmailDraftBundle
} from '$lib/email-draft-bundle';
import type { JsonObject } from '$lib/server/db';

export type DecryptedEmailDraftFields = {
	to: string;
	from_email: string;
	from_name: string | null;
	subject: string;
	html: string;
	text: string | null;
	review: Partial<EmailDraftBundle> | null;
	sent: Partial<EmailDraftBundle> | null;
};

type EncryptedEmailDraftRecord = {
	encryption_version: string;
	encrypted_to: JsonObject | null;
	encrypted_from_email: JsonObject | null;
	encrypted_from_name: JsonObject | null;
	encrypted_subject: JsonObject | null;
	encrypted_html: JsonObject | null;
	encrypted_text: JsonObject | null;
	encrypted_review?: JsonObject | null;
	encrypted_sent?: JsonObject | null;
};

function asEnvelope(value: JsonObject): EncryptedEnvelope {
	return value as unknown as EncryptedEnvelope;
}

async function decryptOptionalField(
	value: JsonObject | null | undefined,
	privateKey: CryptoKey
): Promise<string | null> {
	if (!value) return null;
	return decryptString(asEnvelope(value), privateKey);
}

async function decryptOptionalBundle(
	value: JsonObject | null | undefined,
	privateKey: CryptoKey
): Promise<Partial<EmailDraftBundle> | null> {
	if (!value) return null;
	const json = await decryptString(asEnvelope(value), privateKey);
	const bundle = parseEmailDraftBundleJson(json);
	return bundle;
}

async function decryptReviewOverlay(
	emailDraft: EncryptedEmailDraftRecord,
	privateKey: CryptoKey
): Promise<Partial<EmailDraftBundle> | null> {
	return decryptOptionalBundle(emailDraft.encrypted_review, privateKey);
}

async function decryptSentOverlay(
	emailDraft: EncryptedEmailDraftRecord,
	privateKey: CryptoKey
): Promise<Partial<EmailDraftBundle> | null> {
	return decryptOptionalBundle(emailDraft.encrypted_sent, privateKey);
}

export async function decryptEmailDraftFields(
	emailDraft: EncryptedEmailDraftRecord,
	privateKey: CryptoKey
): Promise<DecryptedEmailDraftFields | null> {
	if (
		emailDraft.encryption_version !== 'e2ee-v1' ||
		!emailDraft.encrypted_to ||
		!emailDraft.encrypted_from_email ||
		!emailDraft.encrypted_subject ||
		!emailDraft.encrypted_html
	) {
		return null;
	}

	try {
		return {
			to: await decryptString(asEnvelope(emailDraft.encrypted_to), privateKey),
			from_email: await decryptString(asEnvelope(emailDraft.encrypted_from_email), privateKey),
			from_name: emailDraft.encrypted_from_name
				? await decryptString(asEnvelope(emailDraft.encrypted_from_name), privateKey)
				: null,
			subject: await decryptString(asEnvelope(emailDraft.encrypted_subject), privateKey),
			html: await decryptString(asEnvelope(emailDraft.encrypted_html), privateKey),
			text: emailDraft.encrypted_text
				? await decryptString(asEnvelope(emailDraft.encrypted_text), privateKey)
				: null,
			review: await decryptReviewOverlay(emailDraft, privateKey),
			sent: await decryptSentOverlay(emailDraft, privateKey)
		};
	} catch (err) {
		console.error('[e2ee] email draft decrypt failed:', err);
		return null;
	}
}

export function emailDraftAgentFields(fields: DecryptedEmailDraftFields): EmailDraftAgentFields {
	return {
		to: fields.to,
		from_email: fields.from_email,
		from_name: fields.from_name,
		subject: fields.subject,
		html: fields.html
	};
}

/** Merged editable/view fields for the current draft state. */
export function emailDraftDisplayFields(
	fields: DecryptedEmailDraftFields,
	status: string
): EmailDraftBundle {
	return emailDraftDisplayBundle(
		emailDraftAgentFields(fields),
		fields.review,
		fields.sent,
		status
	);
}

/** @deprecated Use emailDraftDisplayFields().html */
export function emailDraftDisplayHtml(
	fields: DecryptedEmailDraftFields,
	status: string
): string {
	return emailDraftDisplayFields(fields, status).html;
}
