/**
 * ArelayReader — a browser-side reader for an Agent Relay inbox.
 *
 * Mirror of the delivery-side `ArelayClient` in `@arelay/cli`: where the client
 * encrypts and delivers, the reader unlocks the private key in the browser and
 * fetches + decrypts what arrived. All decryption happens in memory here; the
 * server only ever returns ciphertext and the *encrypted* private key.
 *
 * Phase: same-origin. The read endpoints are authenticated by the portal
 * session cookie, so `baseUrl` must be the origin the user is logged into
 * (the portal itself, or a self-hoster's own deployment). A different-origin
 * frontend would need a human-session auth path added to those endpoints
 * first; that is deliberately out of scope here.
 */

import {
	decryptPayloadBytes,
	decryptString,
	type EncryptedEnvelope,
	type EncryptedPayload
} from '@arelay/core';
import {
	unlockPrivateKey,
	unlockPrivateKeyWithPasskey,
	type EncryptedPrivateKey,
	type PasskeyEncryptedPrivateKey
} from './keyring.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ArelayReaderOptions = {
	/** Origin to read from. Defaults to '' (same-origin relative requests). */
	baseUrl?: string;
	/** Override the fetch implementation (defaults to the global fetch). */
	fetch?: FetchLike;
};

/** Shape returned by `GET /api/e2ee/config` (the encrypted key material). */
export type E2eeConfig = {
	configured: boolean;
	publicKeyJwk: JsonWebKey | null;
	encryptedPrivateKey: EncryptedPrivateKey | null;
	passkeyCredentialId: string | null;
	passkeyEncryptedPrivateKey: PasskeyEncryptedPrivateKey | null;
	recoveryHint: string | null;
};

type MaybeEnvelope = EncryptedEnvelope | Record<string, unknown> | null | undefined;

type WireSession = {
	id: string;
	is_read: boolean;
	created_at: string;
	updated_at: string;
	read_at: string | null;
	encrypted_title: MaybeEnvelope;
	encrypted_summary: MaybeEnvelope;
	artifact_count?: number;
};

type WireArtifact = {
	id: string;
	size_bytes: number;
	encrypted_filename: MaybeEnvelope;
	encrypted_content_type: MaybeEnvelope;
	encrypted_payload: (EncryptedPayload & Record<string, unknown>) | Record<string, unknown> | null;
};

export type DecryptedSession = {
	id: string;
	title: string | null;
	summary: string | null;
	isRead: boolean;
	createdAt: string;
	updatedAt: string;
	readAt: string | null;
	artifactCount: number | null;
};

export type DecryptedArtifact = {
	id: string;
	filename: string | null;
	contentType: string | null;
	sizeBytes: number;
	/** Envelope metadata retained so `getArtifactBytes` can decrypt the body. */
	encryptedPayload: EncryptedPayload | null;
};

export type DecryptedSessionDetail = {
	session: DecryptedSession;
	artifacts: DecryptedArtifact[];
};

export class ArelayReaderError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.name = 'ArelayReaderError';
		this.status = status;
	}
}

export class ArelayReader {
	readonly #baseUrl: string;
	readonly #fetch: FetchLike;
	#privateKey: CryptoKey | null = null;
	#config: E2eeConfig | null = null;

	constructor(options: ArelayReaderOptions = {}) {
		this.#baseUrl = (options.baseUrl ?? '').replace(/\/$/, '');
		const f = options.fetch ?? globalThis.fetch;
		if (!f) throw new Error('No fetch implementation available; pass options.fetch');
		this.#fetch = (input, init) => f(input, init);
	}

	/** Whether a private key has been unlocked in this reader. */
	get unlocked(): boolean {
		return this.#privateKey !== null;
	}

	async #request<T>(path: string): Promise<T> {
		const res = await this.#fetch(`${this.#baseUrl}${path}`, {
			credentials: 'include',
			headers: { Accept: 'application/json' }
		});
		if (!res.ok) {
			throw new ArelayReaderError(`GET ${path} failed (${res.status})`, res.status);
		}
		return (await res.json()) as T;
	}

	/** Fetch the account's encryption config (cached after first call). */
	async getE2eeConfig(force = false): Promise<E2eeConfig> {
		if (this.#config && !force) return this.#config;
		const raw = await this.#request<Partial<E2eeConfig>>('/api/e2ee/config');
		this.#config = {
			configured: Boolean(raw.configured),
			publicKeyJwk: raw.publicKeyJwk ?? null,
			encryptedPrivateKey: raw.encryptedPrivateKey ?? null,
			passkeyCredentialId: raw.passkeyCredentialId ?? null,
			passkeyEncryptedPrivateKey: raw.passkeyEncryptedPrivateKey ?? null,
			recoveryHint: raw.recoveryHint ?? null
		};
		return this.#config;
	}

	/** Unlock the private key with the account recovery key (PBKDF2). */
	async unlockWithRecoveryKey(recoveryKey: string): Promise<void> {
		const config = await this.getE2eeConfig();
		if (!config.encryptedPrivateKey) {
			throw new Error('This account has no recovery-key-wrapped private key');
		}
		this.#privateKey = await unlockPrivateKey(config.encryptedPrivateKey, recoveryKey);
	}

	/** Unlock the private key with a passkey (WebAuthn PRF; browser only). */
	async unlockWithPasskey(): Promise<void> {
		const config = await this.getE2eeConfig();
		if (!config.passkeyEncryptedPrivateKey) {
			throw new Error('This account has no passkey-wrapped private key');
		}
		this.#privateKey = await unlockPrivateKeyWithPasskey(config.passkeyEncryptedPrivateKey);
	}

	/** Use a private key unlocked elsewhere (e.g. during a login ceremony). */
	useUnlockedPrivateKey(privateKey: CryptoKey): void {
		this.#privateKey = privateKey;
	}

	#requirePrivateKey(): CryptoKey {
		if (!this.#privateKey) {
			throw new Error('Reader is locked; call unlockWithRecoveryKey or unlockWithPasskey first');
		}
		return this.#privateKey;
	}

	async #decryptMaybe(value: MaybeEnvelope): Promise<string | null> {
		if (!value) return null;
		try {
			return await decryptString(value as EncryptedEnvelope, this.#requirePrivateKey());
		} catch {
			return null;
		}
	}

	#toDecryptedSession(
		session: WireSession,
		title: string | null,
		summary: string | null
	): DecryptedSession {
		return {
			id: session.id,
			title,
			summary,
			isRead: session.is_read,
			createdAt: session.created_at,
			updatedAt: session.updated_at,
			readAt: session.read_at,
			artifactCount: session.artifact_count ?? null
		};
	}

	/** List inbox sessions with titles and summaries decrypted. */
	async listSessions(): Promise<DecryptedSession[]> {
		this.#requirePrivateKey();
		const { sessions } = await this.#request<{ sessions: WireSession[] }>('/api/sessions');
		return Promise.all(
			sessions.map(async (session) => {
				const [title, summary] = await Promise.all([
					this.#decryptMaybe(session.encrypted_title),
					this.#decryptMaybe(session.encrypted_summary)
				]);
				return this.#toDecryptedSession(session, title, summary);
			})
		);
	}

	/** Fetch one session plus its artifact metadata, all decrypted. */
	async getSession(sessionId: string): Promise<DecryptedSessionDetail> {
		this.#requirePrivateKey();
		const { session, artifacts } = await this.#request<{
			session: WireSession;
			artifacts: WireArtifact[];
		}>(`/api/sessions/${encodeURIComponent(sessionId)}`);

		const [title, summary] = await Promise.all([
			this.#decryptMaybe(session.encrypted_title),
			this.#decryptMaybe(session.encrypted_summary)
		]);

		const decryptedArtifacts = await Promise.all(
			artifacts.map(async (artifact): Promise<DecryptedArtifact> => {
				const [filename, contentType] = await Promise.all([
					this.#decryptMaybe(artifact.encrypted_filename),
					this.#decryptMaybe(artifact.encrypted_content_type)
				]);
				return {
					id: artifact.id,
					filename,
					contentType,
					sizeBytes: Number(artifact.size_bytes),
					encryptedPayload: (artifact.encrypted_payload as EncryptedPayload | null) ?? null
				};
			})
		);

		return {
			session: this.#toDecryptedSession(session, title, summary),
			artifacts: decryptedArtifacts
		};
	}

	/** Fetch an artifact's ciphertext and decrypt it to plaintext bytes. */
	async getArtifactBytes(
		artifact: Pick<DecryptedArtifact, 'id' | 'encryptedPayload'>
	): Promise<Uint8Array> {
		const privateKey = this.#requirePrivateKey();
		if (!artifact.encryptedPayload) {
			throw new Error('Artifact has no encrypted payload metadata');
		}
		const res = await this.#fetch(
			`${this.#baseUrl}/api/artifacts/${encodeURIComponent(artifact.id)}/ciphertext`,
			{ credentials: 'include' }
		);
		if (!res.ok) {
			throw new ArelayReaderError(
				`Could not fetch artifact ciphertext (${res.status})`,
				res.status
			);
		}
		const ciphertextBytes = new Uint8Array(await res.arrayBuffer());
		return decryptPayloadBytes(artifact.encryptedPayload, ciphertextBytes, privateKey);
	}
}
