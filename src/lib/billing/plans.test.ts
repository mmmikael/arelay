import { describe, expect, it } from 'vitest';
import { checkArtifactStorageLimits } from '$lib/storage-limits';
import { PLAN_LIMITS, isPaidPlan, isPlanId, planLimits } from './plans';

describe('planLimits', () => {
	it('keeps the free plan identical to the historical hard-coded limits', () => {
		expect(PLAN_LIMITS.free.maxArtifactBytes).toBe(25 * 1024 * 1024);
		expect(PLAN_LIMITS.free.maxAccountStorageBytes).toBe(500 * 1024 * 1024);
	});

	it('falls back to free for unknown or missing plans', () => {
		expect(planLimits(null)).toBe(PLAN_LIMITS.free);
		expect(planLimits(undefined)).toBe(PLAN_LIMITS.free);
		expect(planLimits('enterprise')).toBe(PLAN_LIMITS.free);
	});

	it('resolves paid plans', () => {
		expect(planLimits('pro')).toBe(PLAN_LIMITS.pro);
		expect(planLimits('founding')).toBe(PLAN_LIMITS.founding);
		expect(PLAN_LIMITS.founding).toEqual(PLAN_LIMITS.pro);
	});
});

describe('isPlanId / isPaidPlan', () => {
	it('recognizes the three plan ids', () => {
		expect(isPlanId('free')).toBe(true);
		expect(isPlanId('pro')).toBe(true);
		expect(isPlanId('founding')).toBe(true);
		expect(isPlanId('premium')).toBe(false);
		expect(isPlanId(null)).toBe(false);
	});

	it('treats pro and founding as paid', () => {
		expect(isPaidPlan('pro')).toBe(true);
		expect(isPaidPlan('founding')).toBe(true);
		expect(isPaidPlan('free')).toBe(false);
		expect(isPaidPlan(null)).toBe(false);
	});
});

describe('plan-aware storage limits', () => {
	const mb = 1024 * 1024;

	it('rejects a 40 MB artifact on free but allows it on pro', () => {
		expect(checkArtifactStorageLimits(40 * mb, 0).ok).toBe(false);
		expect(checkArtifactStorageLimits(40 * mb, 0, PLAN_LIMITS.pro).ok).toBe(true);
	});

	it('enforces the larger pro account quota', () => {
		const nearFreeCap = 490 * mb;
		expect(checkArtifactStorageLimits(20 * mb, nearFreeCap).ok).toBe(false);
		expect(checkArtifactStorageLimits(20 * mb, nearFreeCap, PLAN_LIMITS.pro).ok).toBe(true);
	});

	it('still enforces the pro per-artifact cap', () => {
		const result = checkArtifactStorageLimits(120 * mb, 0, PLAN_LIMITS.pro);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.code).toBe('artifact_too_large');
	});
});
