import { describe, expect, it } from 'vitest';
import {
	e2eeConfigOverwriteRequired,
	MIN_PBKDF2_ITERATIONS,
	publicKeyJwkChanged,
	validateEncryptedPrivateKey,
	validateE2eePublicKeyJwk,
	validatePasskeyEncryptedPrivateKeyInput
} from './e2ee-config-validation';
import {
	testEncryptedPrivateKey,
	testPasskeyEncryptedPrivateKey,
	testPublicKeyJwk,
	TEST_P256_COORD
} from './e2ee-config-fixtures';

describe('e2ee-config-validation', () => {
	it('accepts a valid P-256 public key JWK', () => {
		expect(validateE2eePublicKeyJwk(testPublicKeyJwk)).toBe(true);
	});

	it('rejects public keys that include private material', () => {
		expect(validateE2eePublicKeyJwk({ ...testPublicKeyJwk, d: 'secret' })).toBe(false);
	});

	it('rejects malformed P-256 coordinates', () => {
		expect(validateE2eePublicKeyJwk({ ...testPublicKeyJwk, x: 'abc' })).toBe(false);
	});

	it('accepts a valid encrypted private key envelope', () => {
		expect(validateEncryptedPrivateKey(testEncryptedPrivateKey)).toBe(true);
	});

	it('rejects encrypted private keys with low PBKDF2 iterations', () => {
		expect(
			validateEncryptedPrivateKey({ ...testEncryptedPrivateKey, iterations: MIN_PBKDF2_ITERATIONS - 1 })
		).toBe(false);
	});

	it('accepts a valid passkey encrypted private key envelope', () => {
		expect(validatePasskeyEncryptedPrivateKeyInput(testPasskeyEncryptedPrivateKey)).toBe(true);
	});

	it('detects public key changes for overwrite confirmation', () => {
		expect(publicKeyJwkChanged(testPublicKeyJwk, testPublicKeyJwk)).toBe(false);
		expect(publicKeyJwkChanged(testPublicKeyJwk, { ...testPublicKeyJwk, x: TEST_P256_COORD.slice(0, -1) + 'B' })).toBe(
			true
		);
	});

	it('requires overwrite when encrypted private key changes but public key stays the same', () => {
		const existing = {
			id: 'e2ee-1',
			user_id: 'user-1',
			public_key_jwk: testPublicKeyJwk,
			encrypted_private_key: testEncryptedPrivateKey,
			passkey_credential_id: 'cred-1',
			passkey_encrypted_private_key: null,
			recovery_hint: null,
			created_at: new Date(),
			updated_at: new Date()
		};
		expect(
			e2eeConfigOverwriteRequired(existing, {
				publicKeyJwk: testPublicKeyJwk,
				encryptedPrivateKey: { ...testEncryptedPrivateKey, ciphertext: 'different' },
				passkeyCredentialId: 'cred-1'
			})
		).toBe(true);
	});

	it('allows passkey wrap migration without overwrite when core keys are unchanged', () => {
		const existing = {
			id: 'e2ee-1',
			user_id: 'user-1',
			public_key_jwk: testPublicKeyJwk,
			encrypted_private_key: testEncryptedPrivateKey,
			passkey_credential_id: 'cred-1',
			passkey_encrypted_private_key: testPasskeyEncryptedPrivateKey,
			recovery_hint: null,
			created_at: new Date(),
			updated_at: new Date()
		};
		expect(
			e2eeConfigOverwriteRequired(existing, {
				publicKeyJwk: testPublicKeyJwk,
				encryptedPrivateKey: testEncryptedPrivateKey,
				passkeyCredentialId: 'cred-1'
			})
		).toBe(false);
	});
});
