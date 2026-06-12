/**
 * Envelope encryption for Agent Relay deliveries.
 *
 * Matches the portal's format (src/lib/e2ee.ts in the main repo): per-envelope
 * P-256 ECDH against the recipient's public key, AES-256-GCM for the content.
 * Agents only ever encrypt — decryption happens in the recipient's browser.
 */

import type { webcrypto } from 'node:crypto';

export type JsonWebKey = webcrypto.JsonWebKey;
export type CryptoKey = webcrypto.CryptoKey;
export type JsonWebKeyEnvelope = JsonWebKey & { kty: string };

export type EncryptedEnvelope = {
	v: 1;
	alg: 'P-256-ECDH-A256GCM';
	epk: JsonWebKeyEnvelope;
	iv: string;
	ciphertext: string;
};

/** Envelope metadata without the ciphertext (artifact bytes travel separately). */
export type EncryptedPayload = Omit<EncryptedEnvelope, 'ciphertext'>;

const subtle = globalThis.crypto.subtle;
const TEXT_ENCODER = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64url');
}

export function base64UrlToBytes(value: string): Uint8Array {
	return new Uint8Array(Buffer.from(value, 'base64url'));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importPublicKey(publicKeyJwk: JsonWebKey): Promise<CryptoKey> {
	return subtle.importKey(
		'jwk',
		{
			kty: publicKeyJwk.kty ?? 'EC',
			crv: publicKeyJwk.crv ?? 'P-256',
			x: publicKeyJwk.x ?? '',
			y: publicKeyJwk.y ?? ''
		},
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		[]
	);
}

export async function encryptBytes(
	plaintext: Uint8Array,
	recipientPublicKeyJwk: JsonWebKey
): Promise<EncryptedEnvelope> {
	const recipientPublicKey = await importPublicKey(recipientPublicKeyJwk);
	const ephemeralKeyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveKey'
	]);
	const contentKey = await subtle.deriveKey(
		{ name: 'ECDH', public: recipientPublicKey },
		ephemeralKeyPair.privateKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt']
	);
	const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await subtle.encrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(iv) },
		contentKey,
		toArrayBuffer(plaintext)
	);
	const epk = await subtle.exportKey('jwk', ephemeralKeyPair.publicKey);

	return {
		v: 1,
		alg: 'P-256-ECDH-A256GCM',
		epk: { kty: epk.kty ?? 'EC', crv: epk.crv, x: epk.x, y: epk.y },
		iv: bytesToBase64Url(iv),
		ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
	};
}

export async function encryptString(
	plaintext: string,
	recipientPublicKeyJwk: JsonWebKey
): Promise<EncryptedEnvelope> {
	return encryptBytes(TEXT_ENCODER.encode(plaintext), recipientPublicKeyJwk);
}

export function envelopeToPayload(envelope: EncryptedEnvelope): {
	payload: EncryptedPayload;
	ciphertextBase64Url: string;
	sizeBytes: number;
} {
	const { ciphertext, ...payload } = envelope;
	return {
		payload,
		ciphertextBase64Url: ciphertext,
		sizeBytes: Buffer.byteLength(ciphertext, 'base64url')
	};
}
