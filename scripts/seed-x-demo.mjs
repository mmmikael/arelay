/**
 * Reset local sessions and seed an X-friendly Agent Relay demo inbox.
 *
 *   AGENT_API_TOKEN=ar_... node --env-file=.env scripts/seed-x-demo.mjs
 *
 * Optional:
 *   AGENT_RELAY_URL=http://127.0.0.1:5173
 *   SKIP_DB_RESET=1   # upload only, do not DELETE FROM inbox_sessions
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { webcrypto } from 'node:crypto';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const demoDir = join(rootDir, 'scripts', 'demo', 'x-showcase');
const relayUrl = (process.env.AGENT_RELAY_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const apiToken = process.env.AGENT_API_TOKEN;

if (!apiToken) {
	console.error('AGENT_API_TOKEN is required');
	process.exit(1);
}

function readDemo(name) {
	const path = join(demoDir, name);
	if (!existsSync(path)) throw new Error(`Missing demo asset: ${path}`);
	return readFileSync(path, 'utf8');
}

function runUpload(title, filename, assetName, summary) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				join(rootDir, 'scripts', 'e2ee-agent-upload.mjs'),
				title,
				filename,
				join(demoDir, assetName),
				summary
			],
			{
				env: { ...process.env, AGENT_RELAY_URL: relayUrl, AGENT_API_TOKEN: apiToken },
				stdio: ['ignore', 'pipe', 'pipe']
			}
		);
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`upload failed for ${title}: ${stderr || stdout}`));
				return;
			}
			try {
				resolve(JSON.parse(stdout));
			} catch {
				reject(new Error(`upload returned non-JSON for ${title}: ${stdout}`));
			}
		});
	});
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

function envelopeToPayload(envelope) {
	const { ciphertext, ...payload } = envelope;
	return {
		payload,
		ciphertextBytes: Uint8Array.from(
			atob(
				ciphertext
					.replaceAll('-', '+')
					.replaceAll('_', '/')
					.padEnd(Math.ceil(ciphertext.length / 4) * 4, '=')
			),
			(c) => c.charCodeAt(0)
		)
	};
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

async function uploadArtifact(sessionId, filename, content, publicKeyJwk) {
	const lowerName = filename.toLowerCase();
	const contentType = lowerName.endsWith('.md')
		? 'text/markdown'
		: lowerName.endsWith('.html') || lowerName.endsWith('.htm')
			? 'text/html'
			: 'text/plain';
	const fileEnvelope = await encryptBytes(TEXT_ENCODER.encode(content), publicKeyJwk);
	const { payload, ciphertextBytes } = envelopeToPayload(fileEnvelope);
	return agentFetch(`/api/agent/sessions/${sessionId}/artifacts`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			encrypted: true,
			encrypted_filename: await encryptString(filename, publicKeyJwk),
			encrypted_content_type: await encryptString(contentType, publicKeyJwk),
			encrypted_payload: payload,
			ciphertext_base64: bytesToBase64Url(ciphertextBytes),
			size_bytes: ciphertextBytes.byteLength
		})
	});
}

async function createMultiArtifactSession({ title, summary, files }) {
	const config = await agentFetch('/api/agent/e2ee/config');
	if (!config?.configured || !config.publicKeyJwk) {
		throw new Error('E2EE is not configured for this account');
	}
	const publicKeyJwk = config.publicKeyJwk;
	const { session } = await agentFetch('/api/agent/sessions', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			encrypted: true,
			encrypted_title: await encryptString(title, publicKeyJwk),
			encrypted_summary: await encryptString(summary, publicKeyJwk)
		})
	});
	const artifacts = [];
	for (const file of files) {
		const { artifact } = await uploadArtifact(
			session.id,
			file.filename,
			readDemo(file.asset),
			publicKeyJwk
		);
		artifacts.push(artifact.id);
	}
	return { sessionId: session.id, title, artifacts };
}

async function submitEmailDraft({ to, subject, htmlAsset, text, summary }) {
	const html = readDemo(htmlAsset);
	const childArgs = [
		join(rootDir, 'scripts', 'e2ee-email-draft.mjs'),
		to,
		subject,
		html,
		text
	];
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, childArgs, {
			env: {
				...process.env,
				AGENT_RELAY_URL: relayUrl,
				AGENT_API_TOKEN: apiToken,
				TEST_EMAIL_TO: to
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`email draft failed (${subject}): ${stderr || stdout}`));
				return;
			}
			try {
				resolve(JSON.parse(stdout));
			} catch {
				reject(new Error(`email draft returned non-JSON: ${stdout}`));
			}
		});
	});
}

async function resetSessions() {
	if (process.env.SKIP_DB_RESET === '1') {
		console.log('Skipping DB reset (SKIP_DB_RESET=1).');
		return;
	}
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error('DATABASE_URL is required for reset (or set SKIP_DB_RESET=1).');
		process.exit(1);
	}
	const sql = postgres(databaseUrl, { max: 1 });
	try {
		const [{ n }] =
			await sql`WITH gone AS (DELETE FROM inbox_sessions RETURNING id) SELECT count(*)::int AS n FROM gone`;
		console.log(`Cleared ${n} existing session(s).`);
	} finally {
		await sql.end();
	}
}

const fileSessions = [
	{
		title: 'Production server health report',
		filename: 'server-health.html',
		asset: 'server-health.html',
		summary: 'Overnight infra monitor · all critical services healthy'
	},
	{
		title: 'Security vulnerability alert',
		filename: 'security-alert.html',
		asset: 'security-alert.html',
		summary: 'High-severity CVE detected · patch recommended'
	},
	{
		title: 'AI industry morning brief',
		filename: 'morning-brief.md',
		asset: 'morning-brief.md',
		summary: 'Curated headlines and follow-ups for today'
	},
	{
		title: 'Weekly sales performance report',
		filename: 'sales-report.html',
		asset: 'sales-report.html',
		summary: 'ARR, trials, and pipeline snapshot'
	}
];

console.log(`Seeding demo inbox at ${relayUrl} ...`);
await resetSessions();

const created = [];

for (const session of fileSessions) {
	const result = await runUpload(session.title, session.filename, session.asset, session.summary);
	created.push({ type: 'file', title: session.title, sessionId: result.sessionId });
	console.log(`✓ ${session.title}`);
}

const onboarding = await createMultiArtifactSession({
	title: 'Customer onboarding packet',
	summary: 'Welcome guide + interactive checklist (2 files)',
	files: [
		{ filename: 'welcome-guide.md', asset: 'welcome-guide.md' },
		{ filename: 'onboarding-checklist.html', asset: 'onboarding-checklist.html' }
	]
});
created.push({ type: 'files', title: onboarding.title, sessionId: onboarding.sessionId });
console.log(`✓ ${onboarding.title} (2 artifacts)`);

const investorDraft = await submitEmailDraft({
	to: 'investor@example.com',
	subject: 'Intro: AI startup feedback',
	htmlAsset: 'email-investor.html',
	text: 'Hi Martin — reaching out with an agent-native platform concept. Would love 20 minutes of your time this week.'
});
created.push({
	type: 'email',
	title: investorDraft.subject,
	sessionId: investorDraft.sessionId,
	portalUrl: investorDraft.portalUrl
});
console.log(`✓ Email draft: ${investorDraft.subject}`);

const partnerDraft = await submitEmailDraft({
	to: 'partner@example.com',
	subject: 'Weekly partner check-in',
	htmlAsset: 'email-partner.html',
	text: 'Quick weekly update on pipeline and next steps.'
});
created.push({
	type: 'email',
	title: partnerDraft.subject,
	sessionId: partnerDraft.sessionId,
	portalUrl: partnerDraft.portalUrl
});
console.log(`✓ Email draft: ${partnerDraft.subject}`);

console.log('\nDemo inbox ready:');
console.log(`  Portal: ${relayUrl}/portal`);
console.log(JSON.stringify(created, null, 2));
