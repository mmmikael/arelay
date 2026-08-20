import { describe, expect, it } from 'vitest';
import { decryptString, encryptString } from '@arelay/core';
import { createE2eeKeyring, generateRecoveryKey, unlockPrivateKey } from './keyring.js';

describe('recovery-key keyring', () => {
	it('generates a grouped recovery key', () => {
		const key = generateRecoveryKey();
		// Uppercase base64url in hyphenated groups of 4 (final group may be shorter).
		expect(key).toMatch(/^[A-Z0-9_-]{4}(-[A-Z0-9_-]{1,4})+$/);
	});

	it('round-trips: create keyring, encrypt to its public key, unlock with recovery key, decrypt', async () => {
		const keyring = await createE2eeKeyring();

		const envelope = await encryptString('Quarterly report ready', keyring.publicKeyJwk);

		// Decrypt with the in-memory key from creation.
		expect(await decryptString(envelope, keyring.privateKey)).toBe('Quarterly report ready');

		// Decrypt after re-deriving the private key from the recovery key alone
		// (the path a reader takes — it never has the in-memory key).
		const unlocked = await unlockPrivateKey(keyring.encryptedPrivateKey, keyring.recoveryKey);
		expect(await decryptString(envelope, unlocked)).toBe('Quarterly report ready');
	});

	it('accepts recovery keys regardless of spacing/case', async () => {
		const keyring = await createE2eeKeyring();
		const messy = `  ${keyring.recoveryKey.toLowerCase().replaceAll('-', ' ')}  `;
		const envelope = await encryptString('ok', keyring.publicKeyJwk);
		const unlocked = await unlockPrivateKey(keyring.encryptedPrivateKey, messy);
		expect(await decryptString(envelope, unlocked)).toBe('ok');
	});

	it('rejects the wrong recovery key', async () => {
		const keyring = await createE2eeKeyring();
		await expect(
			unlockPrivateKey(keyring.encryptedPrivateKey, generateRecoveryKey())
		).rejects.toThrow();
	});
});
