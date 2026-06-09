import { describe, expect, it } from 'vitest';
import { retryAfterSecondsFromRollingWindow } from './rate-limit';

describe('retryAfterSecondsFromRollingWindow', () => {
	it('returns time until the oldest item leaves the rolling window', () => {
		const windowMs = 60 * 60_000;
		const nowMs = 1_000_000;
		const oldestMs = nowMs - 30 * 60_000;
		expect(retryAfterSecondsFromRollingWindow(oldestMs, windowMs, nowMs)).toBe(30 * 60);
	});

	it('falls back to the full window when no oldest timestamp exists', () => {
		expect(retryAfterSecondsFromRollingWindow(null, 60 * 60_000)).toBe(60 * 60);
	});

	it('never returns less than one second', () => {
		const windowMs = 60 * 60_000;
		const nowMs = 1_000_000;
		const oldestMs = nowMs - windowMs + 500;
		expect(retryAfterSecondsFromRollingWindow(oldestMs, windowMs, nowMs)).toBe(1);
	});
});
