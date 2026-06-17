import { describe, expect, it } from 'vitest';
import {
	base64UrlToBytes,
	bytesToBase64Url,
	decryptBytes,
	decryptPayloadBytes,
	decryptString,
	encryptBytes,
	encryptString,
	envelopeToPayload,
	payloadToEnvelope,
	type EncryptedEnvelope
} from './index.js';

const subtle = globalThis.crypto.subtle;

async function recipientKeyPair() {
	const keyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveKey'
	]);
	const publicKeyJwk = await subtle.exportKey('jwk', keyPair.publicKey);
	return { publicKeyJwk, privateKey: keyPair.privateKey };
}

describe('envelope encryption', () => {
	it('round-trips strings', async () => {
		const { publicKeyJwk, privateKey } = await recipientKeyPair();
		const envelope = await encryptString('Quarterly report ready', publicKeyJwk);

		expect(envelope.v).toBe(1);
		expect(envelope.alg).toBe('P-256-ECDH-A256GCM');
		expect(envelope.epk.kty).toBe('EC');
		expect(envelope.epk.crv).toBe('P-256');

		expect(await decryptString(envelope, privateKey)).toBe('Quarterly report ready');
	});

	it('round-trips binary content', async () => {
		const { publicKeyJwk, privateKey } = await recipientKeyPair();
		const bytes = globalThis.crypto.getRandomValues(new Uint8Array(4096));
		const envelope = await encryptBytes(bytes, publicKeyJwk);
		expect(await decryptBytes(envelope, privateKey)).toEqual(bytes);
	});

	it('uses unpadded base64url in envelope fields', async () => {
		const { publicKeyJwk } = await recipientKeyPair();
		const envelope = await encryptString('x', publicKeyJwk);
		for (const value of [envelope.iv, envelope.ciphertext]) {
			expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
		}
	});

	it('produces an independent envelope per call', async () => {
		const { publicKeyJwk } = await recipientKeyPair();
		const a = await encryptString('same', publicKeyJwk);
		const b = await encryptString('same', publicKeyJwk);
		expect(a.epk).not.toEqual(b.epk);
		expect(a.ciphertext).not.toBe(b.ciphertext);
	});
});

describe('payload split/recombine', () => {
	it('splits an envelope into payload metadata plus ciphertext bytes and back', async () => {
		const { publicKeyJwk, privateKey } = await recipientKeyPair();
		const envelope = await encryptBytes(new TextEncoder().encode('# Hello\n\nBody'), publicKeyJwk);
		const { payload, ciphertextBytes } = envelopeToPayload(envelope);

		expect(payload).not.toHaveProperty('ciphertext');
		expect(payload.alg).toBe(envelope.alg);
		expect(bytesToBase64Url(ciphertextBytes)).toBe(envelope.ciphertext);

		const plaintext = await decryptBytes(payloadToEnvelope(payload, ciphertextBytes), privateKey);
		expect(new TextDecoder().decode(plaintext)).toBe('# Hello\n\nBody');
	});

	it('decrypts directly from payload metadata and raw ciphertext bytes', async () => {
		const { publicKeyJwk, privateKey } = await recipientKeyPair();
		const envelope = await encryptBytes(new TextEncoder().encode('raw bytes'), publicKeyJwk);
		const { payload, ciphertextBytes } = envelopeToPayload(envelope);

		const plaintext = await decryptPayloadBytes(payload, ciphertextBytes, privateKey);
		expect(new TextDecoder().decode(plaintext)).toBe('raw bytes');
	});

	it('rejects an unsupported payload format', async () => {
		const { publicKeyJwk, privateKey } = await recipientKeyPair();
		const envelope = await encryptBytes(new Uint8Array([1, 2, 3]), publicKeyJwk);
		const { payload, ciphertextBytes } = envelopeToPayload(envelope);

		await expect(
			decryptPayloadBytes(
				{ ...payload, alg: 'RSA-OAEP' as (typeof payload)['alg'] },
				ciphertextBytes,
				privateKey
			)
		).rejects.toThrow('Unsupported encrypted payload format');
	});
});

describe('base64url helpers', () => {
	it('round-trips arbitrary bytes', () => {
		const bytes = globalThis.crypto.getRandomValues(new Uint8Array(33));
		expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
	});

	it('emits no padding or url-unsafe characters', () => {
		for (let length = 0; length < 8; length += 1) {
			const encoded = bytesToBase64Url(new Uint8Array(length).fill(255));
			expect(encoded).not.toMatch(/[+/=]/);
		}
	});
});

describe('cross-package wire compatibility', () => {
	it('decrypts an envelope reconstructed field-by-field (the shape sent over the wire)', async () => {
		const { publicKeyJwk, privateKey } = await recipientKeyPair();
		const envelope = await encryptString('over the wire', publicKeyJwk);

		// Mirror how a delivery is serialized and re-read: payload JSON + base64 ciphertext.
		const { payload, ciphertextBytes } = envelopeToPayload(envelope);
		const wire = {
			...JSON.parse(JSON.stringify(payload)),
			ciphertext_base64: bytesToBase64Url(ciphertextBytes)
		};
		const reconstructed: EncryptedEnvelope = {
			v: wire.v,
			alg: wire.alg,
			epk: wire.epk,
			iv: wire.iv,
			ciphertext: wire.ciphertext_base64
		};
		expect(await decryptString(reconstructed, privateKey)).toBe('over the wire');
	});
});
