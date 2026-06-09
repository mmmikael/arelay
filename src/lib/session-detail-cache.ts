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

export type SessionDetailCachePatch = {
	session?: CachedSessionMeta | null;
	artifacts?: Record<string, CachedArtifactMeta>;
	artifactIds?: string[];
	emailDraft?: DecryptedEmailDraftFields | null;
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
const artifactPlaintextOrder: string[] = [];

export const MAX_ARTIFACT_PLAINTEXT_BYTES = 32 * 1024 * 1024;

let artifactPlaintextCap = MAX_ARTIFACT_PLAINTEXT_BYTES;
let artifactPlaintextBytes = 0;

/** Test-only: lower the plaintext cap without allocating multi-megabyte buffers. */
export function __setArtifactPlaintextCapForTests(bytes: number): void {
	artifactPlaintextCap = bytes;
	evictArtifactPlaintextUntilWithinBudget();
}

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

function removeArtifactPlaintextEntry(artifactId: string): void {
	const bytes = artifactPlaintext.get(artifactId);
	if (!bytes) return;
	artifactPlaintext.delete(artifactId);
	artifactPlaintextBytes = Math.max(0, artifactPlaintextBytes - bytes.byteLength);
	const index = artifactPlaintextOrder.indexOf(artifactId);
	if (index >= 0) artifactPlaintextOrder.splice(index, 1);
}

function purgeArtifactPlaintext(artifactIds: string[]): void {
	for (const artifactId of artifactIds) {
		removeArtifactPlaintextEntry(artifactId);
	}
}

function touchArtifactPlaintextEntry(artifactId: string): void {
	const index = artifactPlaintextOrder.indexOf(artifactId);
	if (index >= 0) artifactPlaintextOrder.splice(index, 1);
	artifactPlaintextOrder.push(artifactId);
}

function evictArtifactPlaintextUntilWithinBudget(): void {
	while (artifactPlaintextBytes > artifactPlaintextCap && artifactPlaintextOrder.length > 0) {
		const artifactId = artifactPlaintextOrder.shift();
		if (!artifactId) break;
		removeArtifactPlaintextEntry(artifactId);
	}
}

function emptyEntry(version: string): SessionDetailEntry {
	return {
		version,
		session: null,
		artifacts: {},
		artifactIds: [],
		emailDraft: undefined
	};
}

function applyPatchForNewVersion(
	patch: SessionDetailCachePatch
): Omit<SessionDetailEntry, 'version'> {
	return {
		session: patch.session !== undefined ? patch.session : null,
		artifacts: patch.artifacts ?? {},
		artifactIds: patch.artifactIds ?? Object.keys(patch.artifacts ?? {}),
		emailDraft: patch.emailDraft
	};
}

function mergePatch(
	existing: SessionDetailEntry | undefined,
	patch: SessionDetailCachePatch
): Omit<SessionDetailEntry, 'version'> {
	const artifacts = patch.artifacts
		? { ...(existing?.artifacts ?? {}), ...patch.artifacts }
		: (existing?.artifacts ?? {});

	const artifactIds = patch.artifactIds
		? [...new Set([...(existing?.artifactIds ?? []), ...patch.artifactIds])]
		: patch.artifacts
			? [...new Set([...(existing?.artifactIds ?? []), ...Object.keys(patch.artifacts)])]
			: (existing?.artifactIds ?? []);

	return {
		session: patch.session !== undefined ? patch.session : (existing?.session ?? null),
		artifacts,
		artifactIds,
		emailDraft: patch.emailDraft !== undefined ? patch.emailDraft : existing?.emailDraft
	};
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
	patch: SessionDetailCachePatch
): void {
	const version = sessionDetailCacheVersion(key);
	const existing = sessionDetails.get(sessionId);

	if (existing && existing.version !== version) {
		purgeArtifactPlaintext(existing.artifactIds);
		sessionDetails.set(sessionId, { version, ...applyPatchForNewVersion(patch) });
		return;
	}

	sessionDetails.set(sessionId, {
		version,
		...mergePatch(existing, patch)
	});
}

export function getCachedArtifactPlaintext(artifactId: string): Uint8Array | null {
	return artifactPlaintext.get(artifactId) ?? null;
}

export function getCachedArtifactPlaintextBytes(): number {
	return artifactPlaintextBytes;
}

export function setCachedArtifactPlaintext(artifactId: string, bytes: Uint8Array): void {
	if (artifactPlaintext.has(artifactId)) {
		removeArtifactPlaintextEntry(artifactId);
	}

	artifactPlaintext.set(artifactId, bytes);
	artifactPlaintextBytes += bytes.byteLength;
	touchArtifactPlaintextEntry(artifactId);
	evictArtifactPlaintextUntilWithinBudget();
}

export function forgetSessionDetailCache(sessionId: string): void {
	const entry = sessionDetails.get(sessionId);
	if (entry) purgeArtifactPlaintext(entry.artifactIds);
	sessionDetails.delete(sessionId);
}

export function resetSessionDetailCache(): void {
	sessionDetails.clear();
	artifactPlaintext.clear();
	artifactPlaintextOrder.length = 0;
	artifactPlaintextBytes = 0;
	artifactPlaintextCap = MAX_ARTIFACT_PLAINTEXT_BYTES;
}
