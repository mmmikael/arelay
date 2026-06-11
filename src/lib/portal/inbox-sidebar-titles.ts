import { decryptEncryptedSessionMeta } from '$lib/session-detail-decrypt';
import {
	getSessionDetailCache,
	mergeSessionDetailCache,
	sessionDetailCacheKey
} from '$lib/session-detail-cache';
import { prioritizeBySessionIds } from '$lib/portal/prioritize';

import type { EncryptedEnvelope } from '$lib/e2ee';

type SidebarSession = {
	id: string;
	updated_at: string | Date;
	encryption_version: string;
	encrypted_title?: EncryptedEnvelope | Record<string, unknown> | null;
	encrypted_summary?: EncryptedEnvelope | Record<string, unknown> | null;
};

type EmailDraftSummaryLookup = Record<
	string,
	{ updated_at?: string | Date | null } | undefined
>;

export type SidebarSessionMeta = { title: string; summary: string | null };

export type LoadSidebarSessionTitlesOptions = {
	prioritySessionIds?: string[];
	onSessionDecrypted?: (sessionId: string, meta: SidebarSessionMeta) => void;
	isCancelled?: () => boolean;
};

const MAX_DECRYPT_CONCURRENCY = 4;

export async function loadSidebarSessionTitles(
	sessions: SidebarSession[],
	emailDraftSummaries: EmailDraftSummaryLookup,
	privateKey: CryptoKey,
	options: LoadSidebarSessionTitlesOptions = {}
): Promise<Record<string, SidebarSessionMeta>> {
	const next: Record<string, SidebarSessionMeta> = {};
	const ordered = prioritizeBySessionIds(sessions, options.prioritySessionIds ?? []);
	let index = 0;

	// Each envelope decrypt is an independent ECDH + AES-GCM; a small worker
	// pool overlaps them while still draining the list in priority order.
	async function worker() {
		while (index < ordered.length) {
			if (options.isCancelled?.()) return;
			const session = ordered[index++];
			if (session.encryption_version !== 'e2ee-v1' || !session.encrypted_title) continue;

			const cacheKey = sessionDetailCacheKey(
				session.updated_at,
				emailDraftSummaries[session.id]?.updated_at ?? null
			);
			const cached = getSessionDetailCache(session.id, cacheKey);
			if (cached?.session) {
				next[session.id] = cached.session;
				options.onSessionDecrypted?.(session.id, cached.session);
				continue;
			}

			const meta = await decryptEncryptedSessionMeta(
				session.encrypted_title,
				session.encrypted_summary,
				privateKey
			);
			if (meta) {
				// Share decrypted metadata with the warm path via the session detail
				// cache so the same session meta is never decrypted twice.
				mergeSessionDetailCache(session.id, cacheKey, { session: meta });
				next[session.id] = meta;
				options.onSessionDecrypted?.(session.id, meta);
			}
		}
	}

	const workers = Math.min(MAX_DECRYPT_CONCURRENCY, ordered.length);
	if (workers > 0) {
		await Promise.all(Array.from({ length: workers }, () => worker()));
	}

	return next;
}
