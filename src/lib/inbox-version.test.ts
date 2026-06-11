import { describe, expect, it } from 'vitest';
import { computeInboxVersionToken, inboxVersionFromStats } from './inbox-version';

describe('computeInboxVersionToken', () => {
	it('formats empty inbox', () => {
		expect(
			computeInboxVersionToken({
				sessionCount: 0,
				readCount: 0,
				latestSessionUpdatedAt: null,
				storageUsedBytes: 0,
				emailDraftCount: 0,
				latestEmailDraftUpdatedAt: null
			})
		).toBe('0:0::0:0:');
	});

	it('includes read count without session updated_at bump', () => {
		const token = computeInboxVersionToken({
			sessionCount: 2,
			readCount: 1,
			latestSessionUpdatedAt: new Date('2026-06-01T12:00:00.000Z'),
			storageUsedBytes: 1024,
			emailDraftCount: 0,
			latestEmailDraftUpdatedAt: null
		});
		expect(token).toBe(`2:1:${new Date('2026-06-01T12:00:00.000Z').getTime()}:1024:0:`);
	});

	it('treats invalid timestamps as empty', () => {
		expect(
			computeInboxVersionToken({
				sessionCount: 1,
				readCount: 0,
				latestSessionUpdatedAt: 'not-a-date',
				storageUsedBytes: 0,
				emailDraftCount: 1,
				latestEmailDraftUpdatedAt: 'also-bad'
			})
		).toBe('1:0::0:1:');
	});
});

describe('inboxVersionFromStats', () => {
	it('matches layout and API aggregation shape', () => {
		const updatedAt = new Date('2026-06-11T08:00:00.000Z');
		const draftUpdatedAt = new Date('2026-06-11T09:00:00.000Z');
		const version = inboxVersionFromStats(
			{ sessionCount: 3, readCount: 2, latestUpdatedAt: updatedAt },
			4096,
			{ draftCount: 1, latestUpdatedAt: draftUpdatedAt }
		);
		expect(version).toBe(
			computeInboxVersionToken({
				sessionCount: 3,
				readCount: 2,
				latestSessionUpdatedAt: updatedAt,
				storageUsedBytes: 4096,
				emailDraftCount: 1,
				latestEmailDraftUpdatedAt: draftUpdatedAt
			})
		);
	});

	it('handles plugin-disabled drafts', () => {
		expect(
			inboxVersionFromStats(
				{ sessionCount: 1, readCount: 0, latestUpdatedAt: null },
				0,
				{ draftCount: 0, latestUpdatedAt: null }
			)
		).toBe('1:0::0:0:');
	});
});
