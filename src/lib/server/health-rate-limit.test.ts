import { afterEach, describe, expect, it } from 'vitest';
import {
	enforceHealthReadyIpRateLimit,
	HEALTH_READY_IP_LIMIT,
	resetHealthReadyRateLimitForTests
} from './health-rate-limit';

describe('enforceHealthReadyIpRateLimit', () => {
	afterEach(() => {
		resetHealthReadyRateLimitForTests();
	});

	it('allows requests under the limit', () => {
		for (let i = 0; i < HEALTH_READY_IP_LIMIT.limit; i++) {
			expect(enforceHealthReadyIpRateLimit('10.0.0.1', 1_000)).toEqual({ ok: true });
		}
	});

	it('blocks when the limit is exceeded in the same window', () => {
		const nowMs = 60_000;
		for (let i = 0; i < HEALTH_READY_IP_LIMIT.limit; i++) {
			enforceHealthReadyIpRateLimit('10.0.0.2', nowMs);
		}
		const blocked = enforceHealthReadyIpRateLimit('10.0.0.2', nowMs + 1);
		expect(blocked.ok).toBe(false);
		if (!blocked.ok) {
			expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
		}
	});

	it('resets counts in a new window', () => {
		const windowMs = HEALTH_READY_IP_LIMIT.windowMs;
		for (let i = 0; i < HEALTH_READY_IP_LIMIT.limit; i++) {
			enforceHealthReadyIpRateLimit('10.0.0.3', windowMs);
		}
		expect(enforceHealthReadyIpRateLimit('10.0.0.3', windowMs * 2)).toEqual({ ok: true });
	});

	it('prunes stale bucket entries from prior windows', () => {
		enforceHealthReadyIpRateLimit('10.0.0.4', 0);
		enforceHealthReadyIpRateLimit('10.0.0.5', 0);
		expect(enforceHealthReadyIpRateLimit('10.0.0.6', HEALTH_READY_IP_LIMIT.windowMs * 3)).toEqual({
			ok: true
		});
	});
});
