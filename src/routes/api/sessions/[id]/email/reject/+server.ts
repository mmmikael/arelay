import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getSession } from '$lib/server/db';
import {
	getEmailDraftBySessionId,
	transitionEmailDraftStatus
} from '../../../../../../plugins/email-review-relay/db';

export const POST: RequestHandler = async ({ locals, params }) => {
	requirePlugin(EMAIL_REVIEW_RELAY_PLUGIN_ID);

	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
	}

	const userId = locals.user!.id;
	const session = await getSession(sessionId, userId);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	const draft = await getEmailDraftBySessionId(sessionId, userId);
	if (!draft) {
		return json({ error: 'Email draft not found' }, { status: 404 });
	}
	if (draft.status !== 'pending') {
		return json({ error: `Draft is already ${draft.status}` }, { status: 409 });
	}

	const rejected = await transitionEmailDraftStatus({
		draftId: draft.id,
		ownerUserId: userId,
		expectedStatus: 'pending',
		nextStatus: 'rejected',
		reviewedAt: new Date()
	});
	if (!rejected) {
		return json({ error: 'Draft is no longer pending' }, { status: 409 });
	}

	return json({ draft: rejected });
};
