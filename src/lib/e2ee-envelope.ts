import type { JsonObject } from '$lib/server/db';

export const MAX_ENCRYPTED_FIELD_LENGTH = 512 * 1024;

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
