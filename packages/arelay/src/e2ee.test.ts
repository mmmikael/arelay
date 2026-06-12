import { describe, expect, it } from 'vitest';
import {
	base64UrlToBytes,
	bytesToBase64Url,
	encryptBytes,
	encryptString,
	envelopeToPayload,
	type EncryptedEnvelope
} from './e2ee.js';

const subtle = globalThis.crypto.subtle;

/**
 * Recipient-side decryption, mirroring the portal's src/lib/e2ee.ts. If this
 * drifts from what the portal does, deliveries become undecryptable — keep it
 * byte-for-byte equivalent.
 */
async function portalDecrypt(
	envelope: EncryptedEnvelope,
	recipientPrivateKey: CryptoKey
): Promise<Uint8Array> {
	if (envelope.v !== 1 || envelope.alg !== 'P-256-ECDH-A256GCM') {
		throw new Error('Unsupported encrypted payload format');
	}
	const ephemeralPublicKey = await subtle.importKey(
		'jwk',
		envelope.epk,
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		[]
	);
	const contentKey = await subtle.deriveKey(
		{ name: 'ECDH', public: ephemeralPublicKey },
		recipientPrivateKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['decrypt']
	);
	const iv = base64UrlToBytes(envelope.iv);
	const ciphertext = base64UrlToBytes(envelope.ciphertext);
	const plaintext = await subtle.decrypt(
		{ name: 'AES-GCM', iv: iv.buffer.slice(0) as ArrayBuffer },
		contentKey,
		ciphertext.buffer.slice(0) as ArrayBuffer
	);
	return new Uint8Array(plaintext);
}

async function recipientKeyPair() {
	const keyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveKey'
	]);
	const publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);
	return { publicKeyJwk, privateKey: keyPair.privateKey };
}

describe('envelope encryption', () => {
	it('produces envelopes the portal can decrypt', async () => {
		const { publicKeyJwk, privateKey } = await recipientKeyPair();
		const envelope = await encryptString('Quarterly report ready', publicKeyJwk);

		expect(envelope.v).toBe(1);
		expect(envelope.alg).toBe('P-256-ECDH-A256GCM');
		expect(envelope.epk.kty).toBe('EC');
		expect(envelope.epk.crv).toBe('P-256');

		const plaintext = await portalDecrypt(envelope, privateKey);
		expect(new TextDecoder().decode(plaintext)).toBe('Quarterly report ready');
	});

	it('round-trips binary content', async () => {
		const { publicKeyJwk, privateKey } = await recipientKeyPair();
		const bytes = globalThis.crypto.getRandomValues(new Uint8Array(4096));
		const envelope = await encryptBytes(bytes, publicKeyJwk);
		const plaintext = await portalDecrypt(envelope, privateKey);
		expect(plaintext).toEqual(bytes);
	});

	it('uses unpadded base64url in envelope fields', async () => {
		const { publicKeyJwk } = await recipientKeyPair();
		const envelope = await encryptString('x', publicKeyJwk);
		for (const value of [envelope.iv, envelope.ciphertext]) {
			expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
		}
	});

	it('splits an envelope into payload metadata plus ciphertext', async () => {
		const { publicKeyJwk } = await recipientKeyPair();
		const envelope = await encryptBytes(new Uint8Array(100), publicKeyJwk);
		const { payload, ciphertextBase64Url, sizeBytes } = envelopeToPayload(envelope);

		expect(payload).not.toHaveProperty('ciphertext');
		expect(payload.alg).toBe(envelope.alg);
		expect(ciphertextBase64Url).toBe(envelope.ciphertext);
		// AES-GCM: plaintext length + 16-byte tag.
		expect(sizeBytes).toBe(116);
	});

	it('round-trips base64url helpers', () => {
		const bytes = globalThis.crypto.getRandomValues(new Uint8Array(33));
		expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
	});
});
