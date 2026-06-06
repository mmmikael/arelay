import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function deriveKey(): Buffer {
	const secret = env.SESSION_SECRET?.trim();
	if (!secret) {
		throw new Error('SESSION_SECRET is required for secret encryption');
	}
	return createHash('sha256').update(`agent-relay:secret:${secret}`).digest();
}

export function encryptSecret(plaintext: string): string {
	const key = deriveKey();
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

export function decryptSecret(ciphertext: string): string {
	const key = deriveKey();
	const packed = Buffer.from(ciphertext, 'base64url');
	const iv = packed.subarray(0, IV_BYTES);
	const tag = packed.subarray(IV_BYTES, IV_BYTES + 16);
	const encrypted = packed.subarray(IV_BYTES + 16);
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
