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

/**
 * Expose a decrypted email draft to the review panel only when it actually
 * belongs to the currently-loaded session.
 *
 * On navigation `data` (and therefore the active session id) updates
 * synchronously, but the effect that re-decrypts the draft runs slightly
 * later. During that window `decryptedEmailDraft` still holds the previously
 * viewed session's draft. The review panel keys its "should re-sync" guard on
 * the *encrypted* record identity, which has already advanced to the new
 * session — so if it sees the stale decrypted draft it latches onto it and
 * never corrects, rendering one session's title beside another's body. Gating
 * on the session id collapses that mismatch to `null` until the decrypt for the
 * active session lands.
 */
export function emailDraftForActiveSession(
	decryptedEmailDraft: DecryptedEmailDraftFields | null,
	decryptedForSessionId: string | null,
	activeSessionId: string
): DecryptedEmailDraftFields | null {
	if (!decryptedEmailDraft) return null;
	return decryptedForSessionId === activeSessionId ? decryptedEmailDraft : null;
}
