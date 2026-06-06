import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getEmailDraftById } from '../../../../../plugins/email-review-relay/db';
import { getSession } from '$lib/server/db';
import { toAgentEmailDraftView } from '../../../../../plugins/email-review-relay/types';

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
		session,
		draft: toAgentEmailDraftView(draft)
	});
};
