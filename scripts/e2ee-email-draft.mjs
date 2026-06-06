/**
 * Submit an E2EE email draft for human review (Email Review Relay plugin).
 *
 * Usage:
 *   AGENT_RELAY_URL=http://localhost:3000 AGENT_API_TOKEN=ar_... node scripts/e2ee-email-draft.mjs [to@example.com] [subject] [html] [plainText]
 *
 * After submit, open the portal session and Approve to send via your Cloudflare credentials.
 */
import { webcrypto } from 'node:crypto';

const relayUrl = (process.env.AGENT_RELAY_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const apiToken = process.env.AGENT_API_TOKEN;
if (!apiToken) {
	console.error('AGENT_API_TOKEN is required');
	process.exit(1);
}

function parseFromAddress(value) {
	const trimmed = value.trim();
	const namedMatch = /^(.+?)\s*<([^>]+)>$/.exec(trimmed);
	if (namedMatch) {
		const name = namedMatch[1].trim().replace(/^["']|["']$/g, '');
		const email = namedMatch[2].trim();
		return { email, name: name || undefined };
	}
	return { email: trimmed };
}

const configuredFrom = process.env.EMAIL_FROM ? parseFromAddress(process.env.EMAIL_FROM) : null;
const toAddress = process.argv[2] ?? process.env.TEST_EMAIL_TO;
const fromEmail = process.env.TEST_EMAIL_FROM ?? configuredFrom?.email ?? 'no-reply@yourdomain.com';
const fromName = process.env.TEST_EMAIL_FROM_NAME ?? configuredFrom?.name ?? 'Agent Relay';
const subject = process.argv[3] ?? 'E2EE email draft test';
const html =
	process.argv[4] ??
	'<p>This is an <strong>encrypted</strong> email draft submitted by <code>scripts/e2ee-email-draft.mjs</code>.</p>';
const text =
	process.argv[5] ??
	'Encrypted email draft submitted by scripts/e2ee-email-draft.mjs. Open the portal to preview the HTML body.';

if (!toAddress) {
	console.error('Recipient required: pass as first arg or set TEST_EMAIL_TO');
	process.exit(1);
}

const TEXT_ENCODER = new TextEncoder();

function bytesToBase64Url(bytes) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function toArrayBuffer(bytes) {
	return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

async function importPublicKey(publicKeyJwk) {
	return webcrypto.subtle.importKey(
		'jwk',
		publicKeyJwk,
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		[]
	);
}

async function deriveContentKey(privateKey, publicKey, usages) {
	return webcrypto.subtle.deriveKey(
		{ name: 'ECDH', public: publicKey },
		privateKey,
		{ name: 'AES-GCM', length: 256 },
		false,
		usages
	);
}

async function encryptBytes(plaintext, recipientPublicKeyJwk) {
	const recipientPublicKey = await importPublicKey(recipientPublicKeyJwk);
	const ephemeralKeyPair = await webcrypto.subtle.generateKey(
		{ name: 'ECDH', namedCurve: 'P-256' },
		true,
		['deriveKey']
	);
	const contentKey = await deriveContentKey(ephemeralKeyPair.privateKey, recipientPublicKey, [
		'encrypt'
	]);
	const iv = webcrypto.getRandomValues(new Uint8Array(12));
	const ciphertext = await webcrypto.subtle.encrypt(
		{ name: 'AES-GCM', iv: toArrayBuffer(iv) },
		contentKey,
		toArrayBuffer(plaintext)
	);
	const epk = await webcrypto.subtle.exportKey('jwk', ephemeralKeyPair.publicKey);
	return {
		v: 1,
		alg: 'P-256-ECDH-A256GCM',
		epk: { kty: epk.kty, crv: epk.crv, x: epk.x, y: epk.y },
		iv: bytesToBase64Url(iv),
		ciphertext: bytesToBase64Url(new Uint8Array(ciphertext))
	};
}

async function encryptString(plaintext, recipientPublicKeyJwk) {
	return encryptBytes(TEXT_ENCODER.encode(plaintext), recipientPublicKeyJwk);
}

async function agentFetch(path, init = {}) {
	const res = await fetch(`${relayUrl}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${apiToken}`,
			...(init.headers ?? {})
		}
	});
	const text = await res.text();
	let body;
	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}
	if (!res.ok) {
		throw new Error(`${init.method ?? 'GET'} ${path} failed (${res.status}): ${JSON.stringify(body)}`);
	}
	return body;
}

const config = await agentFetch('/api/agent/e2ee/config');
if (!config?.configured || !config.publicKeyJwk) {
	throw new Error('E2EE is not configured for this account. Enable encryption in the portal first.');
}

const publicKeyJwk = config.publicKeyJwk;

const body = {
	encrypted: true,
	encrypted_to: await encryptString(toAddress, publicKeyJwk),
	encrypted_from_email: await encryptString(fromEmail, publicKeyJwk),
	encrypted_from_name: await encryptString(fromName, publicKeyJwk),
	encrypted_subject: await encryptString(subject, publicKeyJwk),
	encrypted_html: await encryptString(html, publicKeyJwk),
	encrypted_text: await encryptString(text, publicKeyJwk),
	encrypted_session_summary: await encryptString(`To: ${toAddress}`, publicKeyJwk),
	idempotency_key: `e2ee-email-test-${Date.now()}`
};

const result = await agentFetch('/api/agent/email-drafts', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body)
});

const portalUrl = `${relayUrl}/portal/${result.session.id}`;
console.log(
	JSON.stringify(
		{
			sessionId: result.session.id,
			draftId: result.draft.id,
			status: result.draft.status,
			encryption_version: result.draft.encryption_version,
			to: toAddress,
			subject,
			portalUrl,
			nextStep: 'Open portalUrl, unlock E2EE, preview, and Approve to send.'
		},
		null,
		2
	)
);
