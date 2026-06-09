import { env } from '$env/dynamic/private';

export type RateLimitConfig = {
	limit: number;
	windowMs: number;
};

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function isRateLimitEnabled(): boolean {
	return env.RATE_LIMIT_ENABLED?.trim().toLowerCase() !== 'false';
}

export function isRateLimitExceeded(count: number, limit: number): boolean {
	return count > limit;
}

export function computeWindowStart(nowMs: number, windowMs: number): number {
	return Math.floor(nowMs / windowMs) * windowMs;
}

export function retryAfterSeconds(windowStartMs: number, windowMs: number, nowMs = Date.now()): number {
	const windowEndMs = windowStartMs + windowMs;
	return Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000));
}

export function retryAfterSecondsFromRollingWindow(
	oldestInWindowMs: number | null,
	windowMs: number,
	nowMs = Date.now()
): number {
	if (oldestInWindowMs === null) {
		return Math.max(1, Math.ceil(windowMs / 1000));
	}
	return Math.max(1, Math.ceil((oldestInWindowMs + windowMs - nowMs) / 1000));
}

export function rateLimitResponseBody(
	retryAfterSeconds: number,
	error = 'Too many requests. Try again later.'
): {
	error: string;
	retryAfterSeconds: number;
} {
	return { error, retryAfterSeconds };
}

export function buildRateLimitResponse(retryAfterSeconds: number, error?: string): Response {
	return new Response(JSON.stringify(rateLimitResponseBody(retryAfterSeconds, error)), {
		status: 429,
		headers: {
			'Content-Type': 'application/json',
			'Retry-After': String(retryAfterSeconds)
		}
	});
}
