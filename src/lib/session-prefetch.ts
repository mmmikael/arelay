import { preloadData } from '$app/navigation';
import { fetchAndDecryptArtifactBytes } from '$lib/artifact-bytes';
import { decryptEmailDraftFields } from '$lib/email-draft-decrypt';
import { decryptString, type EncryptedEnvelope } from '$lib/e2ee';
import { prioritizeBySessionIds } from '$lib/portal/prioritize';
import { decryptEncryptedSessionMeta } from '$lib/session-detail-decrypt';
import {
	forgetSessionDetailCache,
	mergeSessionDetailCache,
	resetSessionDetailCache,
	sessionDetailCacheKey,
	sessionDetailCacheVersion
} from '$lib/session-detail-cache';
import type { EmailDraftRecord } from '$plugins/email-review-relay/types';

export const SESSION_PREFETCH_LIMIT = 10;
const MAX_CONCURRENCY = 3;
const MAX_ARTIFACT_WARM_CONCURRENCY = 2;
const MAX_ARTIFACT_PREFETCH_BYTES = 8 * 1024 * 1024;

export type PrefetchSession = {
	id: string;
	updated_at: string | Date;
	email_draft_updated_at?: string | Date | null;
};

type PrefetchArtifact = {
	id: string;
	encrypted_filename: EncryptedEnvelope | Record<string, unknown> | null;
	encrypted_content_type: EncryptedEnvelope | Record<string, unknown> | null;
	encrypted_payload: EncryptedEnvelope | Record<string, unknown> | null;
	size_bytes: number;
};

type PrefetchPageData = {
	session: {
		id: string;
		updated_at: string | Date;
		encrypted_title: EncryptedEnvelope | Record<string, unknown> | null;
		encrypted_summary: EncryptedEnvelope | Record<string, unknown> | null;
	};
	artifacts: PrefetchArtifact[];
	emailDraft?: EmailDraftRecord | null;
};

type EmailDraftSummaryLookup = Record<
	string,
	{ updated_at?: string | Date | null } | undefined
>;

const prefetchedVersions = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();
const warmedVersions = new Map<string, string>();
const warmingInFlight = new Map<string, Promise<void>>();
const prefetchedPageData = new Map<string, PrefetchPageData>();

export function toPrefetchSessions(
	sessions: Array<{ id: string; updated_at: string | Date }>,
	emailDraftSummaries: EmailDraftSummaryLookup = {}
): PrefetchSession[] {
	return sessions.map((session) => ({
		id: session.id,
		updated_at: session.updated_at,
		email_draft_updated_at: emailDraftSummaries[session.id]?.updated_at ?? null
	}));
}

function sessionVersion(session: PrefetchSession): string {
	return sessionDetailCacheVersion(
		sessionDetailCacheKey(session.updated_at, session.email_draft_updated_at ?? null)
	);
}

export function markSessionPrefetched(sessionId: string, updatedAt?: string | Date): void {
	if (updatedAt !== undefined) {
		prefetchedVersions.set(sessionId, sessionDetailCacheVersion(sessionDetailCacheKey(updatedAt)));
	}
}

export function forgetSessionPrefetch(sessionId: string): void {
	prefetchedVersions.delete(sessionId);
	inflight.delete(sessionId);
	warmedVersions.delete(sessionId);
	for (const key of warmingInFlight.keys()) {
		if (key.startsWith(`${sessionId}:`)) warmingInFlight.delete(key);
	}
	prefetchedPageData.delete(sessionId);
	forgetSessionDetailCache(sessionId);
}

export function resetSessionPrefetch(): void {
	prefetchedVersions.clear();
	inflight.clear();
	warmedVersions.clear();
	warmingInFlight.clear();
	prefetchedPageData.clear();
	resetSessionDetailCache();
}

function pageDataCacheKey(pageData: PrefetchPageData) {
	return sessionDetailCacheKey(
		pageData.session.updated_at,
		pageData.emailDraft?.updated_at ?? null
	);
}

function pageDataCacheVersion(pageData: PrefetchPageData): string {
	return sessionDetailCacheVersion(pageDataCacheKey(pageData));
}

export function isSessionPagePrefetched(sessionId: string, updatedAt?: string | Date): boolean {
	if (updatedAt === undefined) {
		return prefetchedVersions.has(sessionId);
	}
	return (
		prefetchedVersions.get(sessionId) ===
		sessionDetailCacheVersion(sessionDetailCacheKey(updatedAt))
	);
}

export function prefetchSessionOnIntent(session: PrefetchSession): void {
	void prefetchSessionPages([session]);
}

async function warmSessionPageData(pageData: PrefetchPageData, privateKey: CryptoKey): Promise<void> {
	const sessionId = pageData.session.id;
	const cacheKey = pageDataCacheKey(pageData);
	const version = pageDataCacheVersion(pageData);
	if (warmedVersions.get(sessionId) === version) return;

	const sessionMeta = await decryptEncryptedSessionMeta(
		pageData.session.encrypted_title,
		pageData.session.encrypted_summary,
		privateKey
	);

	if (pageData.session.encrypted_title && !sessionMeta) {
		return;
	}

	const artifactMeta: Record<string, { filename: string; contentType: string }> = {};
	for (const artifact of pageData.artifacts) {
		if (!artifact.encrypted_filename || !artifact.encrypted_content_type) continue;
		try {
			artifactMeta[artifact.id] = {
				filename: await decryptString(
					artifact.encrypted_filename as EncryptedEnvelope,
					privateKey
				),
				contentType: await decryptString(
					artifact.encrypted_content_type as EncryptedEnvelope,
					privateKey
				)
			};
		} catch (err) {
			console.error('[prefetch] artifact metadata decrypt failed:', err);
		}
	}

	let emailDraft = null;
	if (pageData.emailDraft) {
		emailDraft = await decryptEmailDraftFields(pageData.emailDraft, privateKey);
	}

	mergeSessionDetailCache(sessionId, cacheKey, {
		session: sessionMeta,
		artifacts: artifactMeta,
		artifactIds: pageData.artifacts.map((artifact) => artifact.id),
		emailDraft
	});

	const warmTargets = pageData.artifacts.filter(
		(artifact) =>
			artifact.encrypted_payload &&
			Number(artifact.size_bytes) <= MAX_ARTIFACT_PREFETCH_BYTES
	);

	let index = 0;
	async function artifactWorker() {
		while (index < warmTargets.length) {
			const artifact = warmTargets[index++];
			try {
				await fetchAndDecryptArtifactBytes(artifact, privateKey);
			} catch (err) {
				console.error('[prefetch] artifact bytes warm failed:', err);
			}
		}
	}

	const workers = Math.min(MAX_ARTIFACT_WARM_CONCURRENCY, warmTargets.length);
	if (workers > 0) {
		await Promise.all(Array.from({ length: workers }, () => artifactWorker()));
	}

	warmedVersions.set(sessionId, version);
}

export async function warmPrefetchedSessions(
	privateKey: CryptoKey,
	sessions: PrefetchSession[] = [],
	prioritySessionIds: string[] = []
): Promise<void> {
	const targets = prioritizeBySessionIds(sessions, prioritySessionIds).slice(
		0,
		SESSION_PREFETCH_LIMIT
	);
	for (const session of targets) {
		const pageData = prefetchedPageData.get(session.id);
		if (!pageData) continue;
		const version = pageDataCacheVersion(pageData);
		if (sessionVersion(session) !== version) continue;
		if (warmedVersions.get(session.id) === version) continue;

		const warmKey = `${session.id}:${version}`;
		const existing = warmingInFlight.get(warmKey);
		if (existing) {
			await existing.catch(() => {});
			continue;
		}

		const promise = warmSessionPageData(pageData, privateKey)
			.catch((err) => {
				console.error('[prefetch] session warm failed:', err);
			})
			.finally(() => {
				warmingInFlight.delete(warmKey);
			});
		warmingInFlight.set(warmKey, promise);
		await promise;
	}
}

async function preloadSessionPage(session: PrefetchSession): Promise<void> {
	const version = sessionVersion(session);
	const href = `/portal/${session.id}`;
	const result = await preloadData(href);
	if (result.type === 'loaded') {
		prefetchedVersions.set(session.id, version);
		prefetchedPageData.set(session.id, result.data as PrefetchPageData);
	}
}

export async function prefetchSessionPages(
	sessions: PrefetchSession[],
	prioritySessionIds: string[] = []
): Promise<void> {
	const targets = prioritizeBySessionIds(sessions, prioritySessionIds)
		.slice(0, SESSION_PREFETCH_LIMIT)
		.filter((session) => {
			const version = sessionVersion(session);
			return prefetchedVersions.get(session.id) !== version && !inflight.has(session.id);
		});
	if (targets.length === 0) return;

	let index = 0;

	async function worker() {
		while (index < targets.length) {
			const session = targets[index++];
			const promise = preloadSessionPage(session)
				.catch(() => {
					// Allow a later retry if preload failed.
				})
				.finally(() => {
					inflight.delete(session.id);
				});
			inflight.set(session.id, promise);
			await promise;
		}
	}

	const workers = Math.min(MAX_CONCURRENCY, targets.length);
	await Promise.all(Array.from({ length: workers }, () => worker()));
}
