import {
	computeWindowStart,
	isRateLimitEnabled,
	isRateLimitExceeded,
	retryAfterSeconds,
	type RateLimitConfig,
	type RateLimitResult
} from '$lib/server/rate-limit';

/**
 * In-memory rate limit for `/health/ready` only.
 *
 * Intentionally not Postgres-backed: readiness probes must stay usable when the
 * DB is down or schema checks fail. Limit is per Node process (not cluster-wide).
 */
export const HEALTH_READY_IP_LIMIT: RateLimitConfig = {
	limit: 120,
	windowMs: 60_000
};

type InMemoryBucket = {
	count: number;
	windowStartMs: number;
};

const buckets = new Map<string, InMemoryBucket>();

function pruneStaleBuckets(nowMs: number): void {
	const cutoff = computeWindowStart(nowMs, HEALTH_READY_IP_LIMIT.windowMs);
	for (const [key, bucket] of buckets) {
		if (bucket.windowStartMs < cutoff) {
			buckets.delete(key);
		}
	}
}

export function enforceHealthReadyIpRateLimit(
	clientIp: string,
	nowMs = Date.now()
): RateLimitResult {
	if (!isRateLimitEnabled()) {
		return { ok: true };
	}

	pruneStaleBuckets(nowMs);

	const windowStartMs = computeWindowStart(nowMs, HEALTH_READY_IP_LIMIT.windowMs);
	const key = `health-ready:${clientIp}`;
	const existing = buckets.get(key);

	if (!existing || existing.windowStartMs < windowStartMs) {
		buckets.set(key, { count: 1, windowStartMs });
		return { ok: true };
	}

	existing.count += 1;
	if (!isRateLimitExceeded(existing.count, HEALTH_READY_IP_LIMIT.limit)) {
		return { ok: true };
	}

	return {
		ok: false,
		retryAfterSeconds: retryAfterSeconds(windowStartMs, HEALTH_READY_IP_LIMIT.windowMs, nowMs)
	};
}

/** Test helper — reset in-memory buckets between cases. */
export function resetHealthReadyRateLimitForTests(): void {
	buckets.clear();
}
