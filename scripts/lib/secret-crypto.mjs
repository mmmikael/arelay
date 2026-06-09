import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function deriveKey(sessionSecret) {
	if (!sessionSecret?.trim()) {
		throw new Error('SESSION_SECRET is required for secret encryption');
	}
	return createHash('sha256').update(`agent-relay:secret:${sessionSecret.trim()}`).digest();
}

export function encryptSecret(plaintext, sessionSecret) {
	const key = deriveKey(sessionSecret);
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}
