/**
 * Cheap change-detection token for the portal inbox. The polling endpoint and
 * the portal layout load must produce identical tokens for identical state so
 * the client only invalidates layout data when something actually changed.
 */

function timestampPart(value: string | Date | null | undefined): string {
	if (!value) return '';
	const time = new Date(value).getTime();
	return Number.isNaN(time) ? '' : String(time);
}

export type InboxVersionInput = {
	sessionCount: number;
	readCount: number;
	latestSessionUpdatedAt: string | Date | null;
	storageUsedBytes: number;
	emailDraftCount: number;
	latestEmailDraftUpdatedAt: string | Date | null;
};

export function computeInboxVersionToken(input: InboxVersionInput): string {
	return [
		input.sessionCount,
		input.readCount,
		timestampPart(input.latestSessionUpdatedAt),
		input.storageUsedBytes,
		input.emailDraftCount,
		timestampPart(input.latestEmailDraftUpdatedAt)
	].join(':');
}

export type InboxSessionStats = {
	sessionCount: number;
	readCount: number;
	latestUpdatedAt: Date | null;
};

export type EmailDraftStats = {
	draftCount: number;
	latestUpdatedAt: Date | null;
};

/** Single aggregation path shared by the layout load and /api/inbox/version. */
export function inboxVersionFromStats(
	sessionStats: InboxSessionStats,
	storageUsedBytes: number,
	draftStats: EmailDraftStats
): string {
	return computeInboxVersionToken({
		sessionCount: sessionStats.sessionCount,
		readCount: sessionStats.readCount,
		latestSessionUpdatedAt: sessionStats.latestUpdatedAt,
		storageUsedBytes,
		emailDraftCount: draftStats.draftCount,
		latestEmailDraftUpdatedAt: draftStats.latestUpdatedAt
	});
}
