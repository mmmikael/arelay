import type { E2eeConfig, JsonObject } from '$lib/server/db';
import { parsePasskeyEncryptedPrivateKey } from '$lib/server/e2ee-passkey-config';
import { isValidBase64Url } from '$lib/server/base64url';

export const MIN_PBKDF2_ITERATIONS = 600_000;
const GCM_IV_BYTES = 12;
const P256_COORD_BYTES = 32;

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePublicKeyJwk(value: JsonObject): { kty: string; crv: string; x: string; y: string } {
	const record = value as Record<string, unknown>;
	return {
		kty: String(record.kty),
		crv: String(record.crv),
		x: String(record.x),
		y: String(record.y)
	};
}

export function validateE2eePublicKeyJwk(value: unknown): value is JsonObject {
	if (!isJsonObject(value)) return false;
	const record = value as Record<string, unknown>;
	if (record.kty !== 'EC' || record.crv !== 'P-256') return false;
	if (typeof record.x !== 'string' || !record.x || typeof record.y !== 'string' || !record.y) {
		return false;
	}
	if ('d' in record && record.d !== undefined) return false;
	return (
		isValidBase64Url(record.x, P256_COORD_BYTES) && isValidBase64Url(record.y, P256_COORD_BYTES)
	);
}

export function validateEncryptedPrivateKey(value: unknown): value is JsonObject {
	if (!isJsonObject(value)) return false;
	const record = value as Record<string, unknown>;
	if (record.v !== 1 || record.alg !== 'PBKDF2-SHA256-A256GCM') return false;
	if (
		typeof record.iterations !== 'number' ||
		!Number.isInteger(record.iterations) ||
		record.iterations < MIN_PBKDF2_ITERATIONS
	) {
		return false;
	}
	if (
		typeof record.salt !== 'string' ||
		typeof record.iv !== 'string' ||
		typeof record.ciphertext !== 'string' ||
		!record.salt ||
		!record.iv ||
		!record.ciphertext
	) {
		return false;
	}
	return (
		isValidBase64Url(record.salt) &&
		isValidBase64Url(record.iv, GCM_IV_BYTES) &&
		isValidBase64Url(record.ciphertext)
	);
}

export function validatePasskeyEncryptedPrivateKeyInput(value: unknown): boolean {
	return parsePasskeyEncryptedPrivateKey(value as JsonObject | null | undefined) !== null;
}

export function publicKeyJwkChanged(existing: JsonObject, next: JsonObject): boolean {
	return (
		JSON.stringify(normalizePublicKeyJwk(existing)) !== JSON.stringify(normalizePublicKeyJwk(next))
	);
}

function jsonFieldChanged(existing: JsonObject | null | undefined, next: JsonObject): boolean {
	return JSON.stringify(existing ?? null) !== JSON.stringify(next);
}

export function e2eeConfigOverwriteRequired(
	existing: E2eeConfig,
	input: {
		publicKeyJwk: JsonObject;
		encryptedPrivateKey: JsonObject;
		passkeyCredentialId: string | null;
	}
): boolean {
	if (publicKeyJwkChanged(existing.public_key_jwk, input.publicKeyJwk)) return true;
	if (jsonFieldChanged(existing.encrypted_private_key, input.encryptedPrivateKey)) return true;
	if ((existing.passkey_credential_id ?? null) !== input.passkeyCredentialId) return true;
	return false;
}
