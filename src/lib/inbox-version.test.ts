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

	// Adding an artifact to an existing session must move the inbox version
	// token so the background poll fires and the open detail panel reloads
	// (createArtifact touches the session's updated_at and adds storage bytes
	// without changing the session count). If the token stayed put, new
	// artifacts would not show up until a manual refresh.
	it('changes when an artifact is added to an existing session', () => {
		const before = inboxVersionFromStats(
			{ sessionCount: 3, readCount: 3, latestUpdatedAt: new Date('2026-06-14T10:00:00.000Z') },
			1024,
			{ draftCount: 0, latestUpdatedAt: null }
		);
		// createArtifact bumps updated_at, clears read_at (readCount drops), and
		// grows storage — session count is unchanged.
		const after = inboxVersionFromStats(
			{ sessionCount: 3, readCount: 2, latestUpdatedAt: new Date('2026-06-14T10:05:00.000Z') },
			1024 + 4096,
			{ draftCount: 0, latestUpdatedAt: null }
		);
		expect(after).not.toBe(before);
	});

	it('changes on added storage bytes alone', () => {
		const updatedAt = new Date('2026-06-14T10:00:00.000Z');
		const stats = { sessionCount: 3, readCount: 3, latestUpdatedAt: updatedAt };
		const drafts = { draftCount: 0, latestUpdatedAt: null };
		expect(inboxVersionFromStats(stats, 1024 + 4096, drafts)).not.toBe(
			inboxVersionFromStats(stats, 1024, drafts)
		);
	});
});
