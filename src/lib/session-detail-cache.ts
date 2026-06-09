import type { DecryptedEmailDraftFields } from '$lib/email-draft-decrypt';

export type CachedSessionMeta = {
	title: string;
	summary: string | null;
};

export type CachedArtifactMeta = {
	filename: string;
	contentType: string;
};

export type SessionDetailCacheKey = {
	sessionUpdatedAt: string | Date;
	emailDraftUpdatedAt?: string | Date | null;
};

type SessionDetailEntry = {
	version: string;
	session: CachedSessionMeta | null;
	artifacts: Record<string, CachedArtifactMeta>;
	artifactIds: string[];
	emailDraft: DecryptedEmailDraftFields | null | undefined;
};

const sessionDetails = new Map<string, SessionDetailEntry>();
const artifactPlaintext = new Map<string, Uint8Array>();

export function sessionDetailCacheKey(
	sessionUpdatedAt: string | Date,
	emailDraftUpdatedAt?: string | Date | null
): SessionDetailCacheKey {
	return { sessionUpdatedAt, emailDraftUpdatedAt: emailDraftUpdatedAt ?? null };
}

export function sessionDetailCacheVersion(key: SessionDetailCacheKey): string {
	const sessionPart = String(key.sessionUpdatedAt);
	if (key.emailDraftUpdatedAt == null) return sessionPart;
	return `${sessionPart}|draft:${String(key.emailDraftUpdatedAt)}`;
}

/** @deprecated Use sessionDetailCacheVersion(sessionDetailCacheKey(...)) */
export function sessionDetailVersion(updatedAt: string | Date): string {
	return sessionDetailCacheVersion(sessionDetailCacheKey(updatedAt));
}

function purgeArtifactPlaintext(artifactIds: string[]): void {
	for (const artifactId of artifactIds) {
		artifactPlaintext.delete(artifactId);
	}
}

export function getSessionDetailCache(
	sessionId: string,
	key: SessionDetailCacheKey
): SessionDetailEntry | null {
	const entry = sessionDetails.get(sessionId);
	if (!entry || entry.version !== sessionDetailCacheVersion(key)) return null;
	return entry;
}

export function isSessionDetailReady(sessionId: string, key: SessionDetailCacheKey): boolean {
	const entry = getSessionDetailCache(sessionId, key);
	return Boolean(entry?.session);
}

export function mergeSessionDetailCache(
	sessionId: string,
	key: SessionDetailCacheKey,
	patch: {
		session?: CachedSessionMeta | null;
		artifacts?: Record<string, CachedArtifactMeta>;
		artifactIds?: string[];
		emailDraft?: DecryptedEmailDraftFields | null;
	}
): void {
	const version = sessionDetailCacheVersion(key);
	const existing = sessionDetails.get(sessionId);

	if (existing && existing.version !== version) {
		purgeArtifactPlaintext(existing.artifactIds);
	}

	const mergedArtifacts = patch.artifacts
		? { ...(existing?.version === version ? (existing.artifacts ?? {}) : {}), ...patch.artifacts }
		: existing?.version === version
			? (existing.artifacts ?? {})
			: {};

	const mergedArtifactIds = patch.artifactIds
		? [...new Set([...(existing?.version === version ? (existing.artifactIds ?? []) : []), ...patch.artifactIds])]
		: patch.artifacts
			? [
					...new Set([
						...(existing?.version === version ? (existing.artifactIds ?? []) : []),
						...Object.keys(patch.artifacts)
					])
				]
			: existing?.version === version
				? (existing.artifactIds ?? [])
				: [];

	const next: SessionDetailEntry = {
		version,
		session: patch.session !== undefined ? patch.session : (existing?.session ?? null),
		artifacts: mergedArtifacts,
		artifactIds: mergedArtifactIds,
		emailDraft: patch.emailDraft !== undefined ? patch.emailDraft : existing?.emailDraft
	};

	if (existing && existing.version !== version) {
		next.session = patch.session !== undefined ? patch.session : null;
		next.artifacts = patch.artifacts ?? {};
		next.artifactIds = patch.artifactIds ?? Object.keys(next.artifacts);
		next.emailDraft = patch.emailDraft;
	}

	sessionDetails.set(sessionId, next);
}

export function getCachedArtifactPlaintext(artifactId: string): Uint8Array | null {
	return artifactPlaintext.get(artifactId) ?? null;
}

export function setCachedArtifactPlaintext(artifactId: string, bytes: Uint8Array): void {
	artifactPlaintext.set(artifactId, bytes);
}

export function forgetSessionDetailCache(sessionId: string): void {
	const entry = sessionDetails.get(sessionId);
	if (entry) purgeArtifactPlaintext(entry.artifactIds);
	sessionDetails.delete(sessionId);
}

export function resetSessionDetailCache(): void {
	sessionDetails.clear();
	artifactPlaintext.clear();
}
