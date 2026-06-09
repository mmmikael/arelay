import { describe, expect, it } from 'vitest';
import {
	forgetSessionDetailCache,
	getSessionDetailCache,
	isSessionDetailReady,
	mergeSessionDetailCache,
	resetSessionDetailCache,
	sessionDetailCacheKey,
	setCachedArtifactPlaintext,
	getCachedArtifactPlaintext
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
});
