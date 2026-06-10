import { MIN_PBKDF2_ITERATIONS } from './e2ee-config-validation';

/** Valid 32-byte P-256 coordinate as base64url. */
export const TEST_P256_COORD = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Valid 12-byte GCM IV as base64url (16 chars). */
export const TEST_GCM_IV = 'AAAAAAAAAAAAAAAA';

export const testPublicKeyJwk = {
	kty: 'EC',
	crv: 'P-256',
	x: TEST_P256_COORD,
	y: TEST_P256_COORD
};

export const testEncryptedPrivateKey = {
	v: 1,
	alg: 'PBKDF2-SHA256-A256GCM',
	iterations: MIN_PBKDF2_ITERATIONS,
	salt: 'c2FsdA',
	iv: TEST_GCM_IV,
	ciphertext: 'Y2lwaGVydGV4dA'
};

export const testPasskeyEncryptedPrivateKey = {
	v: 1,
	alg: 'WebAuthnPRF-HKDF-SHA256-A256GCM',
	credentialId: 'cred-1',
	salt: 'c2FsdA',
	iv: TEST_GCM_IV,
	ciphertext: 'Y2lwaGVydGV4dA'
};
