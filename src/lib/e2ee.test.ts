import { describe, expect, it } from 'vitest';
import {
	createE2eeKeyring,
	decryptBytes,
	decryptString,
	encryptBytes,
	encryptString,
	envelopeToPayload,
	payloadToEnvelope,
	type EncryptedEnvelope
} from './e2ee';

describe('e2ee roundtrip', () => {
	it('encrypts and decrypts strings and file bytes with independent envelopes', async () => {
		const keyring = await createE2eeKeyring('ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567');
		const publicKeyJwk = keyring.publicKeyJwk;

		const title = await encryptString('Encrypted delivery test', publicKeyJwk);
		expect(title.v).toBe(1);
		expect(title.ciphertext).toBeTruthy();

		const decryptedTitle = await decryptString(title, keyring.privateKey);
		expect(decryptedTitle).toBe('Encrypted delivery test');

		const fileEnvelope = await encryptBytes(
			new TextEncoder().encode('# Hello\n\nBody'),
			publicKeyJwk
		);
		const filenameEnvelope = await encryptString('report.md', publicKeyJwk);
		const contentTypeEnvelope = await encryptString('text/markdown', publicKeyJwk);

		const filename = await decryptString(filenameEnvelope, keyring.privateKey);
		const contentType = await decryptString(contentTypeEnvelope, keyring.privateKey);
		const { payload, ciphertextBytes } = envelopeToPayload(fileEnvelope);
		const plaintext = await decryptBytes(
			payloadToEnvelope(payload, ciphertextBytes),
			keyring.privateKey
		);

		expect(filename).toBe('report.md');
		expect(contentType).toBe('text/markdown');
		expect(new TextDecoder().decode(plaintext)).toBe('# Hello\n\nBody');
	});

	it('rejects envelopes with the wrong algorithm', async () => {
		const keyring = await createE2eeKeyring('ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567');
		const envelope = (await encryptString('x', keyring.publicKeyJwk)) as EncryptedEnvelope;
		envelope.alg = 'RSA-OAEP' as EncryptedEnvelope['alg'];
		await expect(decryptString(envelope, keyring.privateKey)).rejects.toThrow(
			'Unsupported encrypted payload format'
		);
	});
});
