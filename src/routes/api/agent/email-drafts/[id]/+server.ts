import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getEmailDraftById, toAgentEmailDraftView } from '$plugins/email-review-relay/server';
import { toSessionView } from '$lib/session-view';
import { getSession } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals, params }) => {
	requirePlugin(EMAIL_REVIEW_RELAY_PLUGIN_ID);

	const draftId = params.id;
	if (!draftId) {
		return json({ error: 'Draft id required' }, { status: 400 });
	}

	const draft = await getEmailDraftById(draftId, locals.agentUser!.id);
	if (!draft) {
		return json({ error: 'Draft not found' }, { status: 404 });
	}

	const session = await getSession(draft.session_id, locals.agentUser!.id);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	return json({
		session: toSessionView(session),
		draft: toAgentEmailDraftView(draft)
	});
};
