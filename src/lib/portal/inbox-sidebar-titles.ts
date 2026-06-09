import { decryptEncryptedSessionMeta } from '$lib/session-detail-decrypt';
import { getSessionDetailCache, sessionDetailCacheKey } from '$lib/session-detail-cache';

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

export async function loadSidebarSessionTitles(
	sessions: SidebarSession[],
	emailDraftSummaries: EmailDraftSummaryLookup,
	privateKey: CryptoKey
): Promise<Record<string, { title: string; summary: string | null }>> {
	const next: Record<string, { title: string; summary: string | null }> = {};

	for (const session of sessions) {
		if (session.encryption_version !== 'e2ee-v1' || !session.encrypted_title) continue;

		const cacheKey = sessionDetailCacheKey(
			session.updated_at,
			emailDraftSummaries[session.id]?.updated_at ?? null
		);
		const cached = getSessionDetailCache(session.id, cacheKey);
		if (cached?.session) {
			next[session.id] = cached.session;
			continue;
		}

		const meta = await decryptEncryptedSessionMeta(
			session.encrypted_title,
			session.encrypted_summary,
			privateKey
		);
		if (meta) {
			next[session.id] = meta;
		}
	}

	return next;
}
