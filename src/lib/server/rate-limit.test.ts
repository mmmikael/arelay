import { describe, expect, it } from 'vitest';
import { isPublicAuthPath } from './auth-rate-limit';
import {
	computeWindowStart,
	isRateLimitExceeded,
	rateLimitResponseBody,
	retryAfterSeconds
} from './rate-limit';

describe('computeWindowStart', () => {
	it('aligns timestamps to fixed windows', () => {
		const windowMs = 60_000;
		expect(computeWindowStart(125_000, windowMs)).toBe(120_000);
		expect(computeWindowStart(120_000, windowMs)).toBe(120_000);
	});
});

describe('retryAfterSeconds', () => {
	it('returns seconds until the current window ends', () => {
		const windowMs = 60_000;
		const windowStart = 120_000;
		expect(retryAfterSeconds(windowStart, windowMs, 125_000)).toBe(55);
	});

	it('never returns less than one second', () => {
		const windowMs = 60_000;
		const windowStart = 120_000;
		expect(retryAfterSeconds(windowStart, windowMs, 179_999)).toBe(1);
	});
});

describe('isPublicAuthPath', () => {
	it('matches public auth routes only', () => {
		expect(isPublicAuthPath('/api/auth/passkeys/login/options')).toBe(true);
		expect(isPublicAuthPath('/api/auth/passkeys/signup/verify')).toBe(true);
		expect(isPublicAuthPath('/api/auth/email-verification/start')).toBe(true);
		expect(isPublicAuthPath('/api/agent/sessions')).toBe(false);
		expect(isPublicAuthPath('/api/account/agent-tokens')).toBe(false);
	});
});

describe('rateLimitResponseBody', () => {
	it('includes retry metadata', () => {
		expect(rateLimitResponseBody(42)).toEqual({
			error: 'Too many requests. Try again later.',
			retryAfterSeconds: 42
		});
	});

	it('accepts a custom error message', () => {
		expect(rateLimitResponseBody(10, 'Slow down.')).toEqual({
			error: 'Slow down.',
			retryAfterSeconds: 10
		});
	});

	it('includes requestId when provided', () => {
		expect(rateLimitResponseBody(30, undefined, 'req-abc')).toEqual({
			error: 'Too many requests. Try again later.',
			retryAfterSeconds: 30,
			requestId: 'req-abc'
		});
	});
});

describe('isRateLimitExceeded', () => {
	it('treats the limit itself as allowed', () => {
		expect(isRateLimitExceeded(30, 30)).toBe(false);
		expect(isRateLimitExceeded(31, 30)).toBe(true);
	});
});
