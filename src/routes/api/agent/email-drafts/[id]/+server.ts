import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getEmailDraftById, toAgentEmailDraftView } from '$plugins/email-review-relay/server';
import { toSessionView } from '$lib/session-view';
import { getSession } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ locals, params }) => {
	requirePlugin(EMAIL_REVIEW_RELAY_PLUGIN_ID);

	const draftId = params.id;
	if (!draftId) {
		return routeJsonError(locals, 400, 'Draft id required');
	}

	const draft = await getEmailDraftById(draftId, locals.agentUser!.id);
	if (!draft) {
		return routeJsonError(locals, 404, 'Draft not found');
	}

	const session = await getSession(draft.session_id, locals.agentUser!.id);
	if (!session) {
		return routeJsonError(locals, 404, 'Session not found');
	}

	return json({
		session: toSessionView(session),
		draft: toAgentEmailDraftView(draft)
	});
};
