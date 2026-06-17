/**
 * Isomorphic envelope encryption for Agent Relay.
 *
 * This is the single source of truth for the wire format that the delivery SDK
 * (`@arelay/cli`), the reader (`@arelay/client`), and the portal all share:
 * per-envelope P-256 ECDH against the recipient's public key, AES-256-GCM for
 * the content. Runs in any environment with Web Crypto plus `atob`/`btoa` —
 * Node 20+ and browsers both qualify, so it ships no `Buffer` dependency.
 *
 * Agents only ever encrypt; the recipient's browser is the only place that
 * decrypts. Account-level key management (recovery key, passkey/WebAuthn PRF
 * unlock) is browser-only and lives in `@arelay/client`, not here.
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
const TEXT_DECODER = new TextDecoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function base64UrlToBytes(value: string): Uint8Array {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	globalThis.crypto.getRandomValues(bytes);
	return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function normalizeEphemeralPublicKeyJwk(publicKeyJwk: JsonWebKey): JsonWebKeyEnvelope {
	return {
		kty: publicKeyJwk.kty ?? 'EC',
		crv: publicKeyJwk.crv ?? 'P-256',
		x: publicKeyJwk.x ?? '',
		y: publicKeyJwk.y ?? ''
	};
}

async function importPublicKey(publicKeyJwk: JsonWebKey): Promise<CryptoKey> {
	return subtle.importKey(
		'jwk',
		normalizeEphemeralPublicKeyJwk(publicKeyJwk),
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		[]
	);
}

async function deriveContentKey(
	privateKey: CryptoKey,
	publicKey: CryptoKey,
	usages: webcrypto.KeyUsage[]
): Promise<CryptoKey> {
	return subtle.deriveKey(
		{ name: 'ECDH', public: publicKey },
		privateKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		usages
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
	const contentKey = await deriveContentKey(ephemeralKeyPair.privateKey, recipientPublicKey, [
		'encrypt'
	]);
	const iv = randomBytes(12);
	const ciphertext = await subtle.encrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(iv) },
		contentKey,
		toArrayBuffer(plaintext)
	);
	const exportedEpk = await subtle.exportKey('jwk', ephemeralKeyPair.publicKey);

	return {
		v: 1,
		alg: 'P-256-ECDH-A256GCM',
		epk: normalizeEphemeralPublicKeyJwk(exportedEpk),
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

export async function decryptBytes(
	envelope: EncryptedEnvelope,
	recipientPrivateKey: CryptoKey
): Promise<Uint8Array> {
	return decryptPayloadBytes(envelope, base64UrlToBytes(envelope.ciphertext), recipientPrivateKey);
}

export async function decryptPayloadBytes(
	payload: EncryptedPayload,
	ciphertextBytes: Uint8Array,
	recipientPrivateKey: CryptoKey
): Promise<Uint8Array> {
	if (payload.v !== 1 || payload.alg !== 'P-256-ECDH-A256GCM') {
		throw new Error('Unsupported encrypted payload format');
	}
	const ephemeralPublicKey = await importPublicKey(payload.epk);
	const contentKey = await deriveContentKey(recipientPrivateKey, ephemeralPublicKey, ['decrypt']);
	const plaintext = await subtle.decrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(base64UrlToBytes(payload.iv)) },
		contentKey,
		toArrayBuffer(ciphertextBytes)
	);
	return new Uint8Array(plaintext);
}

export async function decryptString(
	envelope: EncryptedEnvelope,
	recipientPrivateKey: CryptoKey
): Promise<string> {
	return TEXT_DECODER.decode(await decryptBytes(envelope, recipientPrivateKey));
}

export function envelopeToPayload(envelope: EncryptedEnvelope): {
	payload: EncryptedPayload;
	ciphertextBytes: Uint8Array;
} {
	const { ciphertext, ...payload } = envelope;
	return {
		payload,
		ciphertextBytes: base64UrlToBytes(ciphertext)
	};
}

export function payloadToEnvelope(
	payload: EncryptedPayload,
	ciphertextBytes: Uint8Array
): EncryptedEnvelope {
	return {
		...payload,
		ciphertext: bytesToBase64Url(ciphertextBytes)
	};
}
