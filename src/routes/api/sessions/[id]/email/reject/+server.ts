import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getSession } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';
import {
	getEmailDraftBySessionId,
	getSessionDeliveryType,
	transitionEmailDraftStatus
} from '$plugins/email-review-relay/server';

export const POST: RequestHandler = async ({ locals, params }) => {
	requirePlugin(EMAIL_REVIEW_RELAY_PLUGIN_ID);

	const sessionId = params.id;
	if (!sessionId) {
		return routeJsonError(locals, 400, 'Session id required');
	}

	const userId = locals.user!.id;
	const session = await getSession(sessionId, userId);
	if (!session) {
		return routeJsonError(locals, 404, 'Session not found');
	}

	const deliveryType = await getSessionDeliveryType(sessionId, userId);
	if (deliveryType !== 'email_draft') {
		return routeJsonError(locals, 404, 'Session is not an email draft');
	}

	const draft = await getEmailDraftBySessionId(sessionId, userId);
	if (!draft) {
		return routeJsonError(locals, 404, 'Email draft not found');
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
		return routeJsonError(locals, 409, 'Draft is no longer pending');
	}

	return json({ draft: rejected });
};
