import type { JsonObject } from '$lib/server/db';
import type { PasskeyEncryptedPrivateKey } from '$lib/e2ee';

export function parsePasskeyEncryptedPrivateKey(
	value: JsonObject | null | undefined
): PasskeyEncryptedPrivateKey | null {
	if (!value || typeof value !== 'object') return null;

	const record = value as Record<string, unknown>;
	if (
		record.v !== 1 ||
		record.alg !== 'WebAuthnPRF-HKDF-SHA256-A256GCM' ||
		typeof record.credentialId !== 'string' ||
		!record.credentialId ||
		typeof record.salt !== 'string' ||
		!record.salt ||
		typeof record.iv !== 'string' ||
		!record.iv ||
		typeof record.ciphertext !== 'string' ||
		!record.ciphertext
	) {
		return null;
	}

	return {
		v: 1,
		alg: 'WebAuthnPRF-HKDF-SHA256-A256GCM',
		credentialId: record.credentialId,
		salt: record.salt,
		iv: record.iv,
		ciphertext: record.ciphertext
	};
}
