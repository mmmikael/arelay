import { getDb } from '$lib/server/db-connection';
import {
	computeWindowStart,
	isRateLimitExceeded,
	retryAfterSeconds,
	type RateLimitConfig,
	type RateLimitResult
} from '$lib/server/rate-limit';

export async function checkRateLimit(
	bucketKey: string,
	config: RateLimitConfig,
	nowMs = Date.now()
): Promise<RateLimitResult> {
	const windowStartMs = computeWindowStart(nowMs, config.windowMs);
	const windowStart = new Date(windowStartMs);
	const db = getDb();

	const rows = await db<Array<{ count: number; window_start: Date }>>`
		INSERT INTO rate_limit_buckets (bucket_key, window_start, count)
		VALUES (${bucketKey}, ${windowStart}, 1)
		ON CONFLICT (bucket_key) DO UPDATE SET
			count = CASE
				WHEN rate_limit_buckets.window_start < ${windowStart} THEN 1
				ELSE rate_limit_buckets.count + 1
			END,
			window_start = CASE
				WHEN rate_limit_buckets.window_start < ${windowStart} THEN ${windowStart}
				ELSE rate_limit_buckets.window_start
			END
		RETURNING count, window_start
	`;

	const row = rows[0];
	if (!row || !isRateLimitExceeded(row.count, config.limit)) {
		return { ok: true };
	}

	return {
		ok: false,
		retryAfterSeconds: retryAfterSeconds(windowStartMs, config.windowMs, nowMs)
	};
}

export async function peekRateLimit(
	bucketKey: string,
	config: RateLimitConfig,
	nowMs = Date.now()
): Promise<RateLimitResult> {
	const windowStartMs = computeWindowStart(nowMs, config.windowMs);
	const windowStart = new Date(windowStartMs);
	const db = getDb();

	const rows = await db<Array<{ count: number; window_start: Date }>>`
		SELECT count, window_start
		FROM rate_limit_buckets
		WHERE bucket_key = ${bucketKey}
		LIMIT 1
	`;

	const row = rows[0];
	const count =
		row && row.window_start.getTime() >= windowStartMs ? row.count : 0;
	if (!isRateLimitExceeded(count, config.limit)) {
		return { ok: true };
	}

	return {
		ok: false,
		retryAfterSeconds: retryAfterSeconds(windowStartMs, config.windowMs, nowMs)
	};
}
