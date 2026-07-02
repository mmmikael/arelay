import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SPEND_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getSession } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';
import {
	getSessionDeliveryType,
	getSpendRequestBySessionId,
	transitionSpendRequestStatus
} from '$plugins/spend-review-relay/server';

export const POST: RequestHandler = async ({ locals, params }) => {
	requirePlugin(SPEND_REVIEW_RELAY_PLUGIN_ID);

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
	if (deliveryType !== 'spend_request') {
		return routeJsonError(locals, 404, 'Session is not a spend request');
	}

	const spendRequest = await getSpendRequestBySessionId(sessionId, userId);
	if (!spendRequest) {
		return routeJsonError(locals, 404, 'Spend request not found');
	}
	if (spendRequest.status !== 'pending') {
		return json({ error: `Spend request is already ${spendRequest.status}` }, { status: 409 });
	}

	const rejected = await transitionSpendRequestStatus({
		requestId: spendRequest.id,
		ownerUserId: userId,
		expectedStatus: 'pending',
		nextStatus: 'rejected',
		reviewedAt: new Date()
	});
	if (!rejected) {
		return routeJsonError(locals, 409, 'Spend request is no longer pending');
	}

	return json({ request: rejected });
};
