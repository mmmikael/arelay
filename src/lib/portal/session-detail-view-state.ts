import type { DecryptedEmailDraftFields } from '$lib/email-draft-decrypt';
import type { CachedArtifactMeta, CachedSessionMeta } from '$lib/session-detail-cache';

export type SessionDetailViewState = {
	session: CachedSessionMeta | null;
	artifacts: Record<string, CachedArtifactMeta>;
	emailDraft: DecryptedEmailDraftFields | null;
};

export type SessionDetailCacheSnapshot = {
	session: CachedSessionMeta | null;
	artifacts: Record<string, CachedArtifactMeta>;
	emailDraft: DecryptedEmailDraftFields | null | undefined;
};

/** Initial view state for a session before async decrypt completes. */
export function sessionDetailViewFromCache(
	hasEmailDraft: boolean,
	cached: SessionDetailCacheSnapshot | null
): SessionDetailViewState {
	return {
		session: cached?.session ?? null,
		artifacts:
			cached?.artifacts && Object.keys(cached.artifacts).length > 0 ? cached.artifacts : {},
		emailDraft:
			hasEmailDraft && cached && cached.emailDraft !== undefined ? cached.emailDraft : null
	};
}

export function emptySessionDetailViewState(): SessionDetailViewState {
	return {
		session: null,
		artifacts: {},
		emailDraft: null
	};
}
