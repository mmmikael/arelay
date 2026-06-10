import { describe, expect, it } from 'vitest';
import {
	MAX_ACCOUNT_STORAGE_BYTES,
	MAX_ARTIFACT_BYTES,
	MAX_ARTIFACT_UPLOAD_BODY_BYTES,
	artifactUploadBodyTooLarge,
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

	it('sets upload body limit above base64-encoded max artifact size', () => {
		expect(MAX_ARTIFACT_UPLOAD_BODY_BYTES).toBeGreaterThan(MAX_ARTIFACT_BYTES);
	});

	it('rejects oversized Content-Length headers for artifact uploads', () => {
		expect(artifactUploadBodyTooLarge(String(MAX_ARTIFACT_UPLOAD_BODY_BYTES + 1))).toBe(true);
		expect(artifactUploadBodyTooLarge(String(MAX_ARTIFACT_UPLOAD_BODY_BYTES))).toBe(false);
		expect(artifactUploadBodyTooLarge(null)).toBe(false);
	});
});
