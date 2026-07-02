import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SPEND_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getSpendRequestById, toAgentSpendRequestView } from '$plugins/spend-review-relay/server';
import { toSessionView } from '$lib/session-view';
import { getSession } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ locals, params }) => {
	requirePlugin(SPEND_REVIEW_RELAY_PLUGIN_ID);

	const requestId = params.id;
	if (!requestId) {
		return routeJsonError(locals, 400, 'Spend request id required');
	}

	const spendRequest = await getSpendRequestById(requestId, locals.agentUser!.id);
	if (!spendRequest) {
		return routeJsonError(locals, 404, 'Spend request not found');
	}

	const session = await getSession(spendRequest.session_id, locals.agentUser!.id);
	if (!session) {
		return routeJsonError(locals, 404, 'Session not found');
	}

	return json({
		session: toSessionView(session),
		request: toAgentSpendRequestView(spendRequest)
	});
};
