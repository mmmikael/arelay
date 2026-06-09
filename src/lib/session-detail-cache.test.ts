import { describe, expect, it } from 'vitest';
import {
	forgetSessionDetailCache,
	getCachedArtifactPlaintext,
	getCachedArtifactPlaintextBytes,
	getSessionDetailCache,
	isSessionDetailReady,
	MAX_ARTIFACT_PLAINTEXT_BYTES,
	__setArtifactPlaintextCapForTests,
	mergeSessionDetailCache,
	resetSessionDetailCache,
	sessionDetailCacheKey,
	setCachedArtifactPlaintext
} from './session-detail-cache';

describe('session-detail-cache', () => {
	it('stores and retrieves session detail by version', () => {
		resetSessionDetailCache();
		const key = sessionDetailCacheKey('2026-06-06T12:00:00.000Z');
		mergeSessionDetailCache('session-1', key, {
			session: { title: 'Hello', summary: 'World' },
			artifacts: {
				'artifact-1': { filename: 'note.md', contentType: 'text/markdown' }
			}
		});

		const cached = getSessionDetailCache('session-1', key);
		expect(cached?.session).toEqual({ title: 'Hello', summary: 'World' });
		expect(cached?.artifacts['artifact-1']).toEqual({
			filename: 'note.md',
			contentType: 'text/markdown'
		});
		expect(isSessionDetailReady('session-1', key)).toBe(true);
	});

	it('invalidates cache when session version changes', () => {
		resetSessionDetailCache();
		mergeSessionDetailCache('session-1', sessionDetailCacheKey('2026-06-06T12:00:00.000Z'), {
			session: { title: 'Old', summary: null }
		});
		mergeSessionDetailCache('session-1', sessionDetailCacheKey('2026-06-06T13:00:00.000Z'), {
			session: { title: 'New', summary: null }
		});

		expect(
			getSessionDetailCache('session-1', sessionDetailCacheKey('2026-06-06T12:00:00.000Z'))
		).toBeNull();
		expect(
			getSessionDetailCache('session-1', sessionDetailCacheKey('2026-06-06T13:00:00.000Z'))?.session
				?.title
		).toBe('New');
	});

	it('invalidates cache when email draft version changes without session bump', () => {
		resetSessionDetailCache();
		const sessionAt = '2026-06-06T12:00:00.000Z';
		const draftV1 = sessionDetailCacheKey(sessionAt, '2026-06-06T12:01:00.000Z');
		const draftV2 = sessionDetailCacheKey(sessionAt, '2026-06-06T12:02:00.000Z');

		mergeSessionDetailCache('session-1', draftV1, {
			session: { title: 'Draft session', summary: null },
			emailDraft: { subject: 'Old subject' } as never
		});
		mergeSessionDetailCache('session-1', draftV2, {
			session: { title: 'Draft session', summary: null },
			emailDraft: { subject: 'New subject' } as never
		});

		expect(getSessionDetailCache('session-1', draftV1)).toBeNull();
		expect(getSessionDetailCache('session-1', draftV2)?.emailDraft).toEqual({
			subject: 'New subject'
		});
	});

	it('purges artifact plaintext when session cache is forgotten', () => {
		resetSessionDetailCache();
		const key = sessionDetailCacheKey('2026-06-06T12:00:00.000Z');
		const bytes = new Uint8Array([1, 2, 3]);
		mergeSessionDetailCache('session-1', key, {
			artifactIds: ['artifact-1']
		});
		setCachedArtifactPlaintext('artifact-1', bytes);
		expect(getCachedArtifactPlaintext('artifact-1')).toEqual(bytes);

		forgetSessionDetailCache('session-1');
		expect(getCachedArtifactPlaintext('artifact-1')).toBeNull();
	});

	it('purges artifact plaintext when cache version changes', () => {
		resetSessionDetailCache();
		const bytes = new Uint8Array([1, 2, 3]);
		mergeSessionDetailCache('session-1', sessionDetailCacheKey('2026-06-06T12:00:00.000Z'), {
			artifactIds: ['artifact-1']
		});
		setCachedArtifactPlaintext('artifact-1', bytes);

		mergeSessionDetailCache('session-1', sessionDetailCacheKey('2026-06-06T13:00:00.000Z'), {
			session: { title: 'New', summary: null }
		});

		expect(getCachedArtifactPlaintext('artifact-1')).toBeNull();
	});

	it('merges artifact metadata without dropping existing entries', () => {
		resetSessionDetailCache();
		const key = sessionDetailCacheKey('2026-06-06T12:00:00.000Z');
		mergeSessionDetailCache('session-1', key, {
			session: { title: 'Hello', summary: null },
			artifacts: {
				'artifact-1': { filename: 'a.md', contentType: 'text/markdown' }
			},
			artifactIds: ['artifact-1']
		});
		mergeSessionDetailCache('session-1', key, {
			artifacts: {
				'artifact-2': { filename: 'b.md', contentType: 'text/markdown' }
			},
			artifactIds: ['artifact-2']
		});

		const cached = getSessionDetailCache('session-1', key);
		expect(cached?.artifacts['artifact-1']).toEqual({
			filename: 'a.md',
			contentType: 'text/markdown'
		});
		expect(cached?.artifacts['artifact-2']).toEqual({
			filename: 'b.md',
			contentType: 'text/markdown'
		});
		expect(cached?.artifactIds).toEqual(['artifact-1', 'artifact-2']);
	});

	it('evicts oldest artifact plaintext when memory cap is exceeded', () => {
		resetSessionDetailCache();
		__setArtifactPlaintextCapForTests(10);
		const key = sessionDetailCacheKey('2026-06-06T12:00:00.000Z');
		const chunk = new Uint8Array(6);

		mergeSessionDetailCache('session-1', key, { artifactIds: ['artifact-1'] });
		setCachedArtifactPlaintext('artifact-1', chunk);
		expect(getCachedArtifactPlaintext('artifact-1')).toEqual(chunk);

		mergeSessionDetailCache('session-2', key, { artifactIds: ['artifact-2'] });
		setCachedArtifactPlaintext('artifact-2', chunk);

		expect(getCachedArtifactPlaintext('artifact-1')).toBeNull();
		expect(getCachedArtifactPlaintext('artifact-2')).toEqual(chunk);
		expect(getCachedArtifactPlaintextBytes()).toBeLessThanOrEqual(10);
		expect(MAX_ARTIFACT_PLAINTEXT_BYTES).toBe(32 * 1024 * 1024);
	});
});
