import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { inboxVersionFromStats } from '$lib/inbox-version';
import { isEmailReviewRelayEnabled } from '$lib/plugins';
import { getAccountStorageUsedBytes, getInboxSessionStats } from '$lib/server/db';
import { getEmailDraftStats } from '$plugins/email-review-relay/server';

const EMPTY_DRAFT_STATS = { draftCount: 0, latestUpdatedAt: null };

// Lightweight polling target: returns a token that changes whenever the
// portal layout data would change, so the client can skip the full layout
// refetch when nothing happened.
export const GET: RequestHandler = async ({ locals }) => {
	const userId = locals.user!.id;
	const [sessionStats, usedBytes, draftStats] = await Promise.all([
		getInboxSessionStats(userId),
		getAccountStorageUsedBytes(userId),
		isEmailReviewRelayEnabled() ? getEmailDraftStats(userId) : Promise.resolve(EMPTY_DRAFT_STATS)
	]);
	return json(
		{
			version: inboxVersionFromStats(sessionStats, usedBytes, draftStats)
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
