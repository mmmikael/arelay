export type JsonWebKeyEnvelope = JsonWebKey & { kty: string };

export type EncryptedEnvelope = {
	v: 1;
	alg: 'P-256-ECDH-A256GCM';
	epk: JsonWebKeyEnvelope;
	iv: string;
	ciphertext: string;
};

export type EncryptedPayload = Omit<EncryptedEnvelope, 'ciphertext'>;

export type EncryptedPrivateKey = {
	v: 1;
	alg: 'PBKDF2-SHA256-A256GCM';
	iterations: number;
	salt: string;
	iv: string;
	ciphertext: string;
};

export type PasskeyEncryptedPrivateKey = {
	v: 1;
	alg: 'WebAuthnPRF-HKDF-SHA256-A256GCM';
	credentialId: string;
	salt: string;
	iv: string;
	ciphertext: string;
};

export type E2eeKeyring = {
	publicKeyJwk: JsonWebKeyEnvelope;
	privateKey: CryptoKey;
	encryptedPrivateKey: EncryptedPrivateKey;
	recoveryKey: string;
};

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();
const RECOVERY_KEY_BYTES = 32;
const RECOVERY_KEY_GROUP = 4;
const PBKDF2_ITERATIONS = 600_000;
const PASSKEY_PRF_SALT_BYTES = 32;
const PASSKEY_TIMEOUT_MS = 60_000;
const PASSKEY_WRAP_HKDF_SALT = 'Agent Relay passkey PRF private-key wrap v1';
const PASSKEY_WRAP_HKDF_INFO = 'private-key-wrap';

type PrfClientExtensionResults = {
	prf?: {
		enabled?: boolean;
		results?: {
			first?: ArrayBuffer;
			second?: ArrayBuffer;
		};
	};
};

function bytesToBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(value: string): Uint8Array {
	const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function randomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function generateRecoveryKey(): string {
	const raw = bytesToBase64Url(randomBytes(RECOVERY_KEY_BYTES)).toUpperCase();
	const groups: string[] = [];
	for (let i = 0; i < raw.length; i += RECOVERY_KEY_GROUP) {
		groups.push(raw.slice(i, i + RECOVERY_KEY_GROUP));
	}
	return groups.join('-');
}

function normalizeRecoveryKey(recoveryKey: string): string {
	return recoveryKey.trim().replaceAll(/[\s-]+/g, '').toUpperCase();
}

async function deriveWrappingKey(
	recoveryKey: string,
	salt: Uint8Array,
	iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
	const material = await crypto.subtle.importKey(
		'raw',
		TEXT_ENCODER.encode(normalizeRecoveryKey(recoveryKey)),
		'PBKDF2',
		false,
		['deriveKey']
	);
	return crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			hash: 'SHA-256',
			salt: toArrayBuffer(salt),
			iterations
		},
		material,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

async function importPublicKey(publicKeyJwk: JsonWebKey): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'jwk',
		publicKeyJwk,
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		[]
	);
}

async function importPrivateKey(privateKeyJwk: JsonWebKey): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'jwk',
		privateKeyJwk,
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		['deriveKey']
	);
}

async function exportPrivateKeyBytes(privateKey: CryptoKey): Promise<Uint8Array> {
	const privateKeyJwk = await crypto.subtle.exportKey('jwk', privateKey);
	return TEXT_ENCODER.encode(JSON.stringify(privateKeyJwk));
}

async function deriveContentKey(privateKey: CryptoKey, publicKey: CryptoKey, usages: KeyUsage[]) {
	return crypto.subtle.deriveKey(
		{ name: 'ECDH', public: publicKey },
		privateKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		usages
	);
}

async function derivePasskeyWrappingKey(prfOutput: Uint8Array): Promise<CryptoKey> {
	const material = await crypto.subtle.importKey('raw', toArrayBuffer(prfOutput), 'HKDF', false, [
		'deriveKey'
	]);
	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: toArrayBuffer(TEXT_ENCODER.encode(PASSKEY_WRAP_HKDF_SALT)),
			info: toArrayBuffer(TEXT_ENCODER.encode(PASSKEY_WRAP_HKDF_INFO))
		},
		material,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

export async function createE2eeKeyring(recoveryKey = generateRecoveryKey()): Promise<E2eeKeyring> {
	const keyPair = await crypto.subtle.generateKey(
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		['deriveKey']
	);
	const publicKeyJwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKeyEnvelope;
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const wrappingKey = await deriveWrappingKey(recoveryKey, salt);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(iv) },
		wrappingKey,
		toArrayBuffer(await exportPrivateKeyBytes(keyPair.privateKey))
	);

	return {
		publicKeyJwk,
		privateKey: keyPair.privateKey,
		recoveryKey,
		encryptedPrivateKey: {
			v: 1,
			alg: 'PBKDF2-SHA256-A256GCM',
			iterations: PBKDF2_ITERATIONS,
			salt: bytesToBase64Url(salt),
			iv: bytesToBase64Url(iv),
			ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
		}
	};
}

export async function unlockPrivateKey(
	encryptedPrivateKey: EncryptedPrivateKey,
	recoveryKey: string
): Promise<CryptoKey> {
	if (encryptedPrivateKey.v !== 1 || encryptedPrivateKey.alg !== 'PBKDF2-SHA256-A256GCM') {
		throw new Error('Unsupported encrypted key format');
	}
	const salt = base64UrlToBytes(encryptedPrivateKey.salt);
	const iv = base64UrlToBytes(encryptedPrivateKey.iv);
	const wrappingKey = await deriveWrappingKey(recoveryKey, salt, encryptedPrivateKey.iterations);
	const plaintext = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(iv) },
		wrappingKey,
		toArrayBuffer(base64UrlToBytes(encryptedPrivateKey.ciphertext))
	);
	return importPrivateKey(JSON.parse(TEXT_DECODER.decode(plaintext)));
}

export function canAttemptPasskeyPrf(): boolean {
	return (
		typeof PublicKeyCredential !== 'undefined' &&
		typeof navigator !== 'undefined' &&
		Boolean(navigator.credentials?.create) &&
		Boolean(navigator.credentials?.get) &&
		globalThis.isSecureContext !== false
	);
}

function getPrfFirstResult(credential: PublicKeyCredential): Uint8Array | null {
	const results = credential.getClientExtensionResults() as PrfClientExtensionResults;
	const first = results.prf?.results?.first;
	return first ? new Uint8Array(first) : null;
}

async function evaluatePasskeyPrf(credentialId: string, salt: Uint8Array): Promise<Uint8Array> {
	if (!canAttemptPasskeyPrf()) {
		throw new Error('Passkeys are not available in this browser context');
	}

	const credential = (await navigator.credentials.get({
		publicKey: {
			challenge: toArrayBuffer(randomBytes(32)),
			allowCredentials: [
				{
					type: 'public-key',
					id: toArrayBuffer(base64UrlToBytes(credentialId))
				}
			],
			timeout: PASSKEY_TIMEOUT_MS,
			userVerification: 'required',
			extensions: {
				prf: {
					evalByCredential: {
						[credentialId]: { first: toArrayBuffer(salt) }
					}
				}
			}
		} as PublicKeyCredentialRequestOptions
	})) as PublicKeyCredential | null;

	if (!credential) throw new Error('Passkey unlock was cancelled');
	const output = getPrfFirstResult(credential);
	if (!output) throw new Error('This passkey did not return a PRF result');
	return output;
}

export async function wrapPrivateKeyWithPasskey(
	credentialId: string,
	privateKey: CryptoKey
): Promise<PasskeyEncryptedPrivateKey> {
	if (!canAttemptPasskeyPrf()) {
		throw new Error('Passkeys are not available in this browser context');
	}

	const prfSalt = randomBytes(PASSKEY_PRF_SALT_BYTES);
	const prfOutput = await evaluatePasskeyPrf(credentialId, prfSalt);
	const wrappingKey = await derivePasskeyWrappingKey(prfOutput);
	const iv = randomBytes(12);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(iv) },
		wrappingKey,
		toArrayBuffer(await exportPrivateKeyBytes(privateKey))
	);

	return {
		v: 1,
		alg: 'WebAuthnPRF-HKDF-SHA256-A256GCM',
		credentialId,
		salt: bytesToBase64Url(prfSalt),
		iv: bytesToBase64Url(iv),
		ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
	};
}

export async function unlockPrivateKeyWithPasskey(
	encryptedPrivateKey: PasskeyEncryptedPrivateKey
): Promise<CryptoKey> {
	if (
		encryptedPrivateKey.v !== 1 ||
		encryptedPrivateKey.alg !== 'WebAuthnPRF-HKDF-SHA256-A256GCM'
	) {
		throw new Error('Unsupported passkey key format');
	}

	const salt = base64UrlToBytes(encryptedPrivateKey.salt);
	const prfOutput = await evaluatePasskeyPrf(encryptedPrivateKey.credentialId, salt);
	const wrappingKey = await derivePasskeyWrappingKey(prfOutput);
	const plaintext = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(base64UrlToBytes(encryptedPrivateKey.iv)) },
		wrappingKey,
		toArrayBuffer(base64UrlToBytes(encryptedPrivateKey.ciphertext))
	);
	return importPrivateKey(JSON.parse(TEXT_DECODER.decode(plaintext)));
}

export async function encryptBytes(
	plaintext: Uint8Array,
	recipientPublicKeyJwk: JsonWebKey
): Promise<EncryptedEnvelope> {
	const recipientPublicKey = await importPublicKey(recipientPublicKeyJwk);
	const ephemeralKeyPair = await crypto.subtle.generateKey(
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		['deriveKey']
	);
	const contentKey = await deriveContentKey(ephemeralKeyPair.privateKey, recipientPublicKey, [
		'encrypt'
	]);
	const iv = randomBytes(12);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(iv) },
		contentKey,
		toArrayBuffer(plaintext)
	);
	const epk = (await crypto.subtle.exportKey(
		'jwk',
		ephemeralKeyPair.publicKey
	)) as JsonWebKeyEnvelope;

	return {
		v: 1,
		alg: 'P-256-ECDH-A256GCM',
		epk,
		iv: bytesToBase64Url(iv),
		ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
	};
}

export async function decryptBytes(
	envelope: EncryptedEnvelope,
	recipientPrivateKey: CryptoKey
): Promise<Uint8Array> {
	if (envelope.v !== 1 || envelope.alg !== 'P-256-ECDH-A256GCM') {
		throw new Error('Unsupported encrypted payload format');
	}
	const ephemeralPublicKey = await importPublicKey(envelope.epk);
	const contentKey = await deriveContentKey(recipientPrivateKey, ephemeralPublicKey, ['decrypt']);
	const plaintext = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(base64UrlToBytes(envelope.iv)) },
		contentKey,
		toArrayBuffer(base64UrlToBytes(envelope.ciphertext))
	);
	return new Uint8Array(plaintext);
}

export async function encryptString(
	plaintext: string,
	recipientPublicKeyJwk: JsonWebKey
): Promise<EncryptedEnvelope> {
	return encryptBytes(TEXT_ENCODER.encode(plaintext), recipientPublicKeyJwk);
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
