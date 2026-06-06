import { preloadData } from '$app/navigation';

export const SESSION_PREFETCH_LIMIT = 10;
const MAX_CONCURRENCY = 3;

type PrefetchSession = {
	id: string;
	updated_at: string | Date;
};

const prefetchedVersions = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();

function sessionVersion(session: PrefetchSession): string {
	return String(session.updated_at);
}

export function markSessionPrefetched(sessionId: string, updatedAt?: string | Date): void {
	if (updatedAt !== undefined) {
		prefetchedVersions.set(sessionId, String(updatedAt));
	}
}

export function forgetSessionPrefetch(sessionId: string): void {
	prefetchedVersions.delete(sessionId);
	inflight.delete(sessionId);
}

export function resetSessionPrefetch(): void {
	prefetchedVersions.clear();
	inflight.clear();
}

export async function prefetchSessionPages(sessions: PrefetchSession[]): Promise<void> {
	const targets = sessions.slice(0, SESSION_PREFETCH_LIMIT).filter((session) => {
		const version = sessionVersion(session);
		return prefetchedVersions.get(session.id) !== version && !inflight.has(session.id);
	});
	if (targets.length === 0) return;

	let index = 0;

	async function worker() {
		while (index < targets.length) {
			const session = targets[index++];
			const version = sessionVersion(session);
			const href = `/portal/${session.id}`;
			const promise = preloadData(href)
				.then(() => {
					prefetchedVersions.set(session.id, version);
				})
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
