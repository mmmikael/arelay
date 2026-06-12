import { describe, expect, it } from 'vitest';
import { ArelayApiError, ArelayClient } from './client.js';
import { guessContentType } from './content-type.js';

const subtle = globalThis.crypto.subtle;

type RecordedRequest = { url: string; method: string; headers: Record<string, string>; body: unknown };

async function publicKeyJwk(): Promise<JsonWebKey> {
	const keyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveKey'
	]);
	return subtle.exportKey('jwk', keyPair.publicKey);
}

function mockFetch(
	routes: Record<string, (req: RecordedRequest) => { status?: number; body: unknown }>,
	recorded: RecordedRequest[]
): typeof fetch {
	return (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		const path = new URL(url).pathname;
		const request: RecordedRequest = {
			url,
			method: init?.method ?? 'GET',
			headers: Object.fromEntries(
				Object.entries((init?.headers ?? {}) as Record<string, string>)
			),
			body: init?.body ? JSON.parse(String(init.body)) : null
		};
		recorded.push(request);
		const route = routes[`${request.method} ${path}`];
		if (!route) {
			return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
		}
		const result = route(request);
		return new Response(JSON.stringify(result.body), { status: result.status ?? 200 });
	}) as typeof fetch;
}

const SESSION = {
	id: 'session-1',
	is_read: false,
	encryption_version: 'e2ee-v1',
	created_at: '2026-01-01T00:00:00Z',
	updated_at: '2026-01-01T00:00:00Z'
};

describe('ArelayClient', () => {
	it('delivers files: fetches the key once, creates a session, uploads encrypted artifacts', async () => {
		const jwk = await publicKeyJwk();
		const recorded: RecordedRequest[] = [];
		const client = new ArelayClient({
			token: 'ar_test',
			baseUrl: 'https://relay.example/',
			fetch: mockFetch(
				{
					'GET /api/agent/e2ee/config': () => ({ body: { configured: true, publicKeyJwk: jwk } }),
					'POST /api/agent/sessions': () => ({ status: 201, body: { session: SESSION } }),
					'POST /api/agent/sessions/session-1/artifacts': () => ({
						status: 201,
						body: { artifact: { id: 'artifact-1' } }
					})
				},
				recorded
			)
		});

		const result = await client.deliver({
			title: 'Q2 report',
			summary: 'Revenue is up',
			files: [
				{ filename: 'report.md', content: '# Report' },
				{ filename: 'data.csv', content: 'a,b\n1,2' }
			]
		});

		expect(result.sessionId).toBe('session-1');
		expect(result.portalUrl).toBe('https://relay.example/portal/session-1');
		expect(result.artifacts).toHaveLength(2);

		// One config fetch despite four encrypting calls.
		const configCalls = recorded.filter((req) => req.url.includes('/e2ee/config'));
		expect(configCalls).toHaveLength(1);

		for (const req of recorded) {
			expect(req.headers.Authorization).toBe('Bearer ar_test');
		}

		const sessionReq = recorded.find((req) => req.method === 'POST' && req.url.endsWith('/sessions'));
		const sessionBody = sessionReq?.body as Record<string, unknown>;
		expect(sessionBody.encrypted).toBe(true);
		expect(sessionBody.encrypted_title).toMatchObject({ v: 1, alg: 'P-256-ECDH-A256GCM' });
		expect(sessionBody.encrypted_summary).toMatchObject({ v: 1 });

		const uploadReqs = recorded.filter((req) => req.url.endsWith('/artifacts'));
		expect(uploadReqs).toHaveLength(2);
		const uploadBody = uploadReqs[0]?.body as Record<string, unknown>;
		expect(uploadBody.encrypted).toBe(true);
		expect(uploadBody.encrypted_filename).toMatchObject({ v: 1 });
		expect(uploadBody.encrypted_content_type).toMatchObject({ v: 1 });
		expect(uploadBody.encrypted_payload).not.toHaveProperty('ciphertext');
		expect(uploadBody.ciphertext_base64).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(uploadBody.size_bytes).toBeGreaterThan(0);
	});

	it('reuses an existing session when sessionId is provided', async () => {
		const jwk = await publicKeyJwk();
		const recorded: RecordedRequest[] = [];
		const client = new ArelayClient({
			token: 'ar_test',
			baseUrl: 'https://relay.example',
			fetch: mockFetch(
				{
					'GET /api/agent/e2ee/config': () => ({ body: { configured: true, publicKeyJwk: jwk } }),
					'POST /api/agent/sessions/existing/artifacts': () => ({
						status: 201,
						body: { artifact: { id: 'artifact-1' } }
					})
				},
				recorded
			)
		});

		await client.deliver({
			title: 'ignored',
			sessionId: 'existing',
			files: [{ filename: 'a.txt', content: 'hello' }]
		});

		expect(recorded.some((req) => req.method === 'POST' && req.url.endsWith('/sessions'))).toBe(false);
	});

	it('surfaces a setup hint when E2EE is not configured', async () => {
		const client = new ArelayClient({
			token: 'ar_test',
			baseUrl: 'https://relay.example',
			fetch: mockFetch(
				{
					'GET /api/agent/e2ee/config': () => ({
						status: 428,
						body: { configured: false, publicKeyJwk: null, error: 'e2ee_required' }
					})
				},
				[]
			)
		});

		await expect(
			client.deliver({ title: 'x', files: [{ filename: 'a.txt', content: 'x' }] })
		).rejects.toThrow(/encryption setup/i);
	});

	it('surfaces a token hint on 401', async () => {
		const client = new ArelayClient({
			token: 'ar_bad',
			baseUrl: 'https://relay.example',
			fetch: mockFetch(
				{ 'GET /api/agent/sessions': () => ({ status: 401, body: { error: 'Unauthorized' } }) },
				[]
			)
		});

		const error = await client.listSessions().catch((err) => err);
		expect(error).toBeInstanceOf(ArelayApiError);
		expect(error.status).toBe(401);
		expect(error.message).toMatch(/agent api token/i);
	});

	it('shapes email draft requests with optional fields omitted', async () => {
		const jwk = await publicKeyJwk();
		const recorded: RecordedRequest[] = [];
		const client = new ArelayClient({
			token: 'ar_test',
			baseUrl: 'https://relay.example',
			fetch: mockFetch(
				{
					'GET /api/agent/e2ee/config': () => ({ body: { configured: true, publicKeyJwk: jwk } }),
					'POST /api/agent/email-drafts': () => ({
						status: 201,
						body: { session: SESSION, draft: { id: 'draft-1', status: 'pending_review' } }
					})
				},
				recorded
			)
		});

		const result = await client.createEmailDraft({
			to: 'human@example.com',
			fromEmail: 'agent@example.com',
			subject: 'Weekly summary',
			html: '<p>Done.</p>',
			idempotencyKey: 'weekly-1'
		});

		expect(result.draft.status).toBe('pending_review');
		const draftBody = recorded.find((req) => req.url.endsWith('/email-drafts'))
			?.body as Record<string, unknown>;
		expect(draftBody.encrypted).toBe(true);
		expect(draftBody.encrypted_to).toMatchObject({ v: 1 });
		expect(draftBody.idempotency_key).toBe('weekly-1');
		expect(draftBody).not.toHaveProperty('encrypted_from_name');
		expect(draftBody).not.toHaveProperty('encrypted_text');
	});
});

describe('guessContentType', () => {
	it('maps common extensions', () => {
		expect(guessContentType('report.md')).toBe('text/markdown');
		expect(guessContentType('index.HTML')).toBe('text/html');
		expect(guessContentType('chart.png')).toBe('image/png');
		expect(guessContentType('doc.pdf')).toBe('application/pdf');
		expect(guessContentType('blob.unknownext')).toBe('application/octet-stream');
	});
});
