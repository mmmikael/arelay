import { describe, expect, it } from 'vitest';
import {
	MAX_ACCOUNT_STORAGE_BYTES,
	MAX_ARTIFACT_BYTES,
	checkArtifactStorageLimits
} from './storage-limits';

describe('checkArtifactStorageLimits', () => {
	it('allows uploads within per-artifact and account limits', () => {
		expect(checkArtifactStorageLimits(1024, 0)).toEqual({ ok: true });
		expect(checkArtifactStorageLimits(MAX_ARTIFACT_BYTES, 0)).toEqual({ ok: true });
		expect(
			checkArtifactStorageLimits(1024, MAX_ACCOUNT_STORAGE_BYTES - 1024)
		).toEqual({ ok: true });
	});

	it('rejects artifacts larger than 25 MB', () => {
		const result = checkArtifactStorageLimits(MAX_ARTIFACT_BYTES + 1, 0);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('artifact_too_large');
		}
	});

	it('rejects uploads that would exceed the 500 MB account cap', () => {
		const result = checkArtifactStorageLimits(1024, MAX_ACCOUNT_STORAGE_BYTES);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.code).toBe('account_quota_exceeded');
		}
	});
});
