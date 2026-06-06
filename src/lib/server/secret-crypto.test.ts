import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		SESSION_SECRET: 'test-session-secret-for-unit-tests'
	}
}));

import { decryptSecret, encryptSecret } from './secret-crypto';

describe('secret-crypto', () => {
	it('round-trips encrypted secrets', () => {
		const plaintext = 'cloudflare-api-token-value';
		const ciphertext = encryptSecret(plaintext);
		expect(ciphertext).not.toBe(plaintext);
		expect(decryptSecret(ciphertext)).toBe(plaintext);
	});

	it('produces different ciphertext for the same plaintext', () => {
		const plaintext = 'same-token';
		expect(encryptSecret(plaintext)).not.toBe(encryptSecret(plaintext));
	});

	it('fails to decrypt tampered ciphertext', () => {
		const ciphertext = encryptSecret('token');
		const tampered = `${ciphertext.slice(0, -2)}xx`;
		expect(() => decryptSecret(tampered)).toThrow();
	});
});
