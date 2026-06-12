import {
	encryptBytes,
	encryptString,
	envelopeToPayload,
	type EncryptedEnvelope,
	type JsonWebKey
} from './e2ee.js';
import { guessContentType } from './content-type.js';

export const DEFAULT_BASE_URL = 'https://arelay.app';

export type ArelayClientOptions = {
	/** Agent API token (`ar_...`), created in the portal under Account. */
	token: string;
	/** Relay base URL. Defaults to https://arelay.app; point at your own host when self-hosting. */
	baseUrl?: string;
	/** Override fetch (used in tests). */
	fetch?: typeof fetch;
};

export type SessionView = {
	id: string;
	is_read: boolean;
	encryption_version: string;
	created_at: string;
	updated_at: string;
};

export type DeliverFile = {
	filename: string;
	/** File content; strings are UTF-8 encoded. */
	content: Uint8Array | string;
	/** Defaults to a guess from the filename extension. */
	contentType?: string;
};

export type DeliverResult = {
	sessionId: string;
	portalUrl: string;
	artifacts: Array<{ id: string; filename: string }>;
};

export type EmailDraftInput = {
	to: string;
	fromEmail: string;
	fromName?: string;
	subject: string;
	html: string;
	text?: string;
	/** Plaintext summary shown in the inbox sidebar (encrypted before upload). */
	sessionSummary?: string;
	/** Resubmitting with the same key returns the existing draft instead of creating a duplicate. */
	idempotencyKey?: string;
};

export class ArelayApiError extends Error {
	readonly status: number;
	readonly body: unknown;
	readonly hint: string | null;

	constructor(message: string, status: number, body: unknown, hint: string | null = null) {
		super(hint ? `${message} ${hint}` : message);
		this.name = 'ArelayApiError';
		this.status = status;
		this.body = body;
		this.hint = hint;
	}
}

function hintFor(status: number, body: unknown): string | null {
	const errorCode =
		typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : '';
	if (status === 401) {
		return 'Check your agent API token: create one in the portal (Account → Agent API tokens) and set ARELAY_TOKEN.';
	}
	if (status === 428 || errorCode === 'e2ee_required') {
		return 'End-to-end encryption is not set up for this account yet. Open the portal once and complete encryption setup, then retry.';
	}
	if (status === 413) {
		return 'The file exceeds the per-artifact size limit (25 MB).';
	}
	if (status === 429) {
		return 'Rate limited — wait and retry.';
	}
	if (status === 404 && errorCode.includes('plugin')) {
		return 'This relay does not have the Email Review Relay plugin enabled.';
	}
	return null;
}

export class ArelayClient {
	readonly baseUrl: string;
	#token: string;
	#fetch: typeof fetch;
	#publicKeyJwk: JsonWebKey | null = null;

	constructor(options: ArelayClientOptions) {
		if (!options.token) {
			throw new Error('An agent API token is required (set ARELAY_TOKEN or pass token).');
		}
		let baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
		while (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
		this.baseUrl = baseUrl;
		this.#token = options.token;
		this.#fetch = options.fetch ?? fetch;
	}

	/** Build a client from ARELAY_TOKEN / ARELAY_URL (legacy AGENT_API_TOKEN / AGENT_RELAY_URL also accepted). */
	static fromEnv(env: NodeJS.ProcessEnv = process.env): ArelayClient {
		const token = env.ARELAY_TOKEN ?? env.AGENT_API_TOKEN;
		if (!token) {
			throw new Error('Set ARELAY_TOKEN to an agent API token from the portal.');
		}
		return new ArelayClient({
			token,
			baseUrl: env.ARELAY_URL ?? env.AGENT_RELAY_URL ?? DEFAULT_BASE_URL
		});
	}

	portalUrl(sessionId: string): string {
		return `${this.baseUrl}/portal/${sessionId}`;
	}

	async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
		const res = await this.#fetch(`${this.baseUrl}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${this.#token}`,
				...(init.body ? { 'Content-Type': 'application/json' } : {}),
				...(init.headers ?? {})
			}
		});
		const text = await res.text();
		let body: unknown = null;
		try {
			body = text ? JSON.parse(text) : null;
		} catch {
			body = text;
		}
		if (!res.ok) {
			const detail =
				typeof body === 'object' && body !== null && 'error' in body
					? String((body as { error: unknown }).error)
					: res.statusText;
			throw new ArelayApiError(
				`${init.method ?? 'GET'} ${path} failed (${res.status}): ${detail}.`,
				res.status,
				body,
				hintFor(res.status, body)
			);
		}
		return body as T;
	}

	async getE2eeConfig(): Promise<{ configured: boolean; publicKeyJwk: JsonWebKey | null }> {
		return this.#request('/api/agent/e2ee/config');
	}

	async #publicKey(): Promise<JsonWebKey> {
		if (this.#publicKeyJwk) return this.#publicKeyJwk;
		const config = await this.getE2eeConfig();
		if (!config.configured || !config.publicKeyJwk) {
			throw new ArelayApiError(
				'E2EE is not configured for this account.',
				428,
				config,
				hintFor(428, { error: 'e2ee_required' })
			);
		}
		this.#publicKeyJwk = config.publicKeyJwk;
		return this.#publicKeyJwk;
	}

	async listSessions(): Promise<SessionView[]> {
		const { sessions } = await this.#request<{ sessions: SessionView[] }>('/api/agent/sessions');
		return sessions;
	}

	async getSession(sessionId: string): Promise<SessionView> {
		const { session } = await this.#request<{ session: SessionView }>(
			`/api/agent/sessions/${sessionId}`
		);
		return session;
	}

	async createSession(input: { title: string; summary?: string }): Promise<SessionView> {
		const publicKey = await this.#publicKey();
		const [encryptedTitle, encryptedSummary] = await Promise.all([
			encryptString(input.title, publicKey),
			input.summary ? encryptString(input.summary, publicKey) : Promise.resolve(null)
		]);
		const { session } = await this.#request<{ session: SessionView }>('/api/agent/sessions', {
			method: 'POST',
			body: JSON.stringify({
				encrypted: true,
				encrypted_title: encryptedTitle,
				encrypted_summary: encryptedSummary
			})
		});
		return session;
	}

	async updateSession(
		sessionId: string,
		input: { title: string; summary?: string }
	): Promise<SessionView> {
		const publicKey = await this.#publicKey();
		const [encryptedTitle, encryptedSummary] = await Promise.all([
			encryptString(input.title, publicKey),
			input.summary ? encryptString(input.summary, publicKey) : Promise.resolve(null)
		]);
		const { session } = await this.#request<{ session: SessionView }>(
			`/api/agent/sessions/${sessionId}`,
			{
				method: 'PATCH',
				body: JSON.stringify({
					encrypted: true,
					encrypted_title: encryptedTitle,
					encrypted_summary: encryptedSummary
				})
			}
		);
		return session;
	}

	async uploadArtifact(
		sessionId: string,
		file: DeliverFile
	): Promise<{ id: string; filename: string }> {
		const publicKey = await this.#publicKey();
		const contentBytes =
			typeof file.content === 'string' ? new TextEncoder().encode(file.content) : file.content;
		const contentType = file.contentType ?? guessContentType(file.filename);

		const [fileEnvelope, encryptedFilename, encryptedContentType] = await Promise.all([
			encryptBytes(contentBytes, publicKey),
			encryptString(file.filename, publicKey),
			encryptString(contentType, publicKey)
		]);
		const { payload, ciphertextBase64Url, sizeBytes } = envelopeToPayload(fileEnvelope);

		const { artifact } = await this.#request<{ artifact: { id: string } }>(
			`/api/agent/sessions/${sessionId}/artifacts`,
			{
				method: 'POST',
				body: JSON.stringify({
					encrypted: true,
					encrypted_filename: encryptedFilename,
					encrypted_content_type: encryptedContentType,
					encrypted_payload: payload,
					ciphertext_base64: ciphertextBase64Url,
					size_bytes: sizeBytes
				})
			}
		);
		return { id: artifact.id, filename: file.filename };
	}

	/**
	 * High-level delivery: create a session (or reuse `sessionId`) and upload
	 * all files into it.
	 */
	async deliver(input: {
		title: string;
		summary?: string;
		sessionId?: string;
		files: DeliverFile[];
	}): Promise<DeliverResult> {
		if (input.files.length === 0) {
			throw new Error('At least one file is required.');
		}
		const sessionId =
			input.sessionId ??
			(await this.createSession({ title: input.title, summary: input.summary })).id;

		const artifacts: DeliverResult['artifacts'] = [];
		for (const file of input.files) {
			artifacts.push(await this.uploadArtifact(sessionId, file));
		}
		return { sessionId, portalUrl: this.portalUrl(sessionId), artifacts };
	}

	/** Submit an outbound email draft for human review (Email Review Relay plugin). */
	async createEmailDraft(input: EmailDraftInput): Promise<{
		sessionId: string;
		portalUrl: string;
		draft: { id: string; status: string };
	}> {
		const publicKey = await this.#publicKey();
		const [to, fromEmail, fromName, subject, html, text, sessionSummary] = await Promise.all([
			encryptString(input.to, publicKey),
			encryptString(input.fromEmail, publicKey),
			input.fromName ? encryptString(input.fromName, publicKey) : Promise.resolve(null),
			encryptString(input.subject, publicKey),
			encryptString(input.html, publicKey),
			input.text ? encryptString(input.text, publicKey) : Promise.resolve(null),
			input.sessionSummary
				? encryptString(input.sessionSummary, publicKey)
				: Promise.resolve(null)
		]);

		const body: Record<string, unknown> = {
			encrypted: true,
			encrypted_to: to,
			encrypted_from_email: fromEmail,
			encrypted_subject: subject,
			encrypted_html: html
		};
		if (fromName) body.encrypted_from_name = fromName;
		if (text) body.encrypted_text = text;
		if (sessionSummary) body.encrypted_session_summary = sessionSummary;
		if (input.idempotencyKey) body.idempotency_key = input.idempotencyKey;

		const result = await this.#request<{
			session: SessionView;
			draft: { id: string; status: string };
		}>('/api/agent/email-drafts', { method: 'POST', body: JSON.stringify(body) });

		return {
			sessionId: result.session.id,
			portalUrl: this.portalUrl(result.session.id),
			draft: result.draft
		};
	}
}

export type { EncryptedEnvelope };
