import type { JsonObject } from '$lib/server/db';

export const MAX_ENCRYPTED_FIELD_LENGTH = 512 * 1024;

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEncryptedEnvelopeCore(record: Record<string, unknown>, requireCiphertext: boolean): boolean {
	if (
		record.v !== 1 ||
		record.alg !== 'P-256-ECDH-A256GCM' ||
		!isJsonObject(record.epk) ||
		typeof record.iv !== 'string' ||
		record.iv.length === 0
	) {
		return false;
	}

	if (!requireCiphertext) {
		return record.ciphertext === undefined;
	}

	return (
		typeof record.ciphertext === 'string' &&
		record.ciphertext.length > 0 &&
		record.ciphertext.length <= MAX_ENCRYPTED_FIELD_LENGTH
	);
}

export function isEncryptedEnvelope(value: unknown): value is JsonObject {
	if (!isJsonObject(value)) return false;
	return isEncryptedEnvelopeCore(value as Record<string, unknown>, true);
}

/** File envelope metadata without inline ciphertext (bytes sent separately as ciphertext_base64). */
export function isEncryptedArtifactPayload(value: unknown): value is JsonObject {
	if (!isJsonObject(value)) return false;
	return isEncryptedEnvelopeCore(value as Record<string, unknown>, false);
}
