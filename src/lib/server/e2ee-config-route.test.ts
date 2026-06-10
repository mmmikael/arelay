import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST as postE2eeConfig } from '../../routes/api/e2ee/config/+server';
import {
	testEncryptedPrivateKey,
	testPasskeyEncryptedPrivateKey,
	testPublicKeyJwk,
	TEST_P256_COORD
} from './e2ee-config-fixtures';

vi.mock('$lib/server/db', () => ({
	getE2eeConfig: vi.fn(),
	listCredentialsForUser: vi.fn(),
	upsertE2eeConfig: vi.fn()
}));

import { getE2eeConfig, listCredentialsForUser, upsertE2eeConfig } from '$lib/server/db';

function humanLocals() {
	return {
		user: { id: 'user-1' },
		requestId: 'req-1',
		log: { warn: vi.fn(), error: vi.fn() }
	} as unknown as App.Locals;
}

describe('POST /api/e2ee/config', () => {
	beforeEach(() => {
		vi.mocked(getE2eeConfig).mockReset();
		vi.mocked(listCredentialsForUser).mockReset();
		vi.mocked(upsertE2eeConfig).mockReset();
	});

	it('requires confirmOverwrite when replacing an existing public key', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue({
			public_key_jwk: { ...testPublicKeyJwk, x: TEST_P256_COORD.slice(0, -1) + 'B' }
		} as unknown as Awaited<ReturnType<typeof getE2eeConfig>>);

		const response = await postE2eeConfig({
			locals: humanLocals(),
			request: new Request('http://localhost/api/e2ee/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ publicKeyJwk: testPublicKeyJwk, encryptedPrivateKey: testEncryptedPrivateKey })
			})
		} as Parameters<typeof postE2eeConfig>[0]);

		expect(response.status).toBe(409);
		expect(await response.json()).toMatchObject({ error: expect.stringContaining('confirmOverwrite') });
		expect(upsertE2eeConfig).not.toHaveBeenCalled();
	});

	it('requires confirmOverwrite when encrypted private key changes', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue({
			public_key_jwk: testPublicKeyJwk,
			encrypted_private_key: testEncryptedPrivateKey,
			passkey_credential_id: 'cred-1'
		} as unknown as Awaited<ReturnType<typeof getE2eeConfig>>);
		vi.mocked(listCredentialsForUser).mockResolvedValue([{ id: 'cred-1' }] as Awaited<
			ReturnType<typeof listCredentialsForUser>
		>);

		const response = await postE2eeConfig({
			locals: humanLocals(),
			request: new Request('http://localhost/api/e2ee/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					publicKeyJwk: testPublicKeyJwk,
					encryptedPrivateKey: { ...testEncryptedPrivateKey, ciphertext: 'different' },
					passkeyCredentialId: 'cred-1'
				})
			})
		} as Parameters<typeof postE2eeConfig>[0]);

		expect(response.status).toBe(409);
		expect(upsertE2eeConfig).not.toHaveBeenCalled();
	});

	it('allows passkey-only updates without confirmOverwrite', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue({
			public_key_jwk: testPublicKeyJwk,
			encrypted_private_key: testEncryptedPrivateKey,
			passkey_credential_id: 'cred-1'
		} as unknown as Awaited<ReturnType<typeof getE2eeConfig>>);
		vi.mocked(listCredentialsForUser).mockResolvedValue([{ id: 'cred-1' }] as Awaited<
			ReturnType<typeof listCredentialsForUser>
		>);
		vi.mocked(upsertE2eeConfig).mockResolvedValue({
			public_key_jwk: testPublicKeyJwk,
			encrypted_private_key: testEncryptedPrivateKey,
			passkey_credential_id: 'cred-1',
			passkey_encrypted_private_key: testPasskeyEncryptedPrivateKey,
			recovery_hint: null
		} as unknown as Awaited<ReturnType<typeof upsertE2eeConfig>>);

		const response = await postE2eeConfig({
			locals: humanLocals(),
			request: new Request('http://localhost/api/e2ee/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					publicKeyJwk: testPublicKeyJwk,
					encryptedPrivateKey: testEncryptedPrivateKey,
					passkeyCredentialId: 'cred-1',
					passkeyEncryptedPrivateKey: testPasskeyEncryptedPrivateKey
				})
			})
		} as Parameters<typeof postE2eeConfig>[0]);

		expect(response.status).toBe(200);
		expect(upsertE2eeConfig).toHaveBeenCalled();
	});

	it('accepts confirmOverwrite for key replacement', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue({
			public_key_jwk: testPublicKeyJwk,
			encrypted_private_key: testEncryptedPrivateKey,
			passkey_credential_id: null
		} as unknown as Awaited<ReturnType<typeof getE2eeConfig>>);
		vi.mocked(upsertE2eeConfig).mockResolvedValue({
			public_key_jwk: { ...testPublicKeyJwk, x: TEST_P256_COORD.slice(0, -1) + 'B' },
			encrypted_private_key: testEncryptedPrivateKey,
			passkey_credential_id: null,
			passkey_encrypted_private_key: null,
			recovery_hint: null
		} as unknown as Awaited<ReturnType<typeof upsertE2eeConfig>>);

		const response = await postE2eeConfig({
			locals: humanLocals(),
			request: new Request('http://localhost/api/e2ee/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					publicKeyJwk: { ...testPublicKeyJwk, x: TEST_P256_COORD.slice(0, -1) + 'B' },
					encryptedPrivateKey: testEncryptedPrivateKey,
					confirmOverwrite: true
				})
			})
		} as Parameters<typeof postE2eeConfig>[0]);

		expect(response.status).toBe(200);
		expect(upsertE2eeConfig).toHaveBeenCalled();
	});

	it('rejects passkeyCredentialId that does not belong to the account', async () => {
		vi.mocked(getE2eeConfig).mockResolvedValue(null);
		vi.mocked(listCredentialsForUser).mockResolvedValue([{ id: 'cred-other' }] as Awaited<
			ReturnType<typeof listCredentialsForUser>
		>);

		const response = await postE2eeConfig({
			locals: humanLocals(),
			request: new Request('http://localhost/api/e2ee/config', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					publicKeyJwk: testPublicKeyJwk,
					encryptedPrivateKey: testEncryptedPrivateKey,
					passkeyCredentialId: 'cred-1',
					passkeyEncryptedPrivateKey: testPasskeyEncryptedPrivateKey
				})
			})
		} as Parameters<typeof postE2eeConfig>[0]);

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: expect.stringContaining('passkeyCredentialId') });
	});
});
