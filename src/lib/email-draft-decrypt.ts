import { decryptString, type EncryptedEnvelope } from '$lib/e2ee';
import type { JsonObject } from '$lib/server/db';

export type DecryptedEmailDraftFields = {
	to: string;
	from_email: string;
	from_name: string | null;
	subject: string;
	html: string;
	text: string | null;
};

type EncryptedEmailDraftRecord = {
	encryption_version: string;
	encrypted_to: JsonObject | null;
	encrypted_from_email: JsonObject | null;
	encrypted_from_name: JsonObject | null;
	encrypted_subject: JsonObject | null;
	encrypted_html: JsonObject | null;
	encrypted_text: JsonObject | null;
};

function asEnvelope(value: JsonObject): EncryptedEnvelope {
	return value as unknown as EncryptedEnvelope;
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
				: null
		};
	} catch (err) {
		console.error('[e2ee] email draft decrypt failed:', err);
		return null;
	}
}
