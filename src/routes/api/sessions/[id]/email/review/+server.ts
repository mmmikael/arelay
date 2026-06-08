import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getSession } from '$lib/server/db';
import {
	getEmailDraftBySessionId,
	getSessionDeliveryType,
	parseEmailDraftReviewBody,
	updateEmailDraftReview
} from '$plugins/email-review-relay/server';

const REVIEWABLE_STATUSES = new Set(['pending', 'failed']);

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
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

	const deliveryType = await getSessionDeliveryType(sessionId, userId);
	if (deliveryType !== 'email_draft') {
		return json({ error: 'Session is not an email draft' }, { status: 404 });
	}

	const draft = await getEmailDraftBySessionId(sessionId, userId);
	if (!draft) {
		return json({ error: 'Email draft not found' }, { status: 404 });
	}
	if (!REVIEWABLE_STATUSES.has(draft.status)) {
		return json({ error: `Draft is already ${draft.status}` }, { status: 409 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = parseEmailDraftReviewBody(body);
	if (!parsed.ok) {
		return json({ error: parsed.error }, { status: 400 });
	}

	const updated = await updateEmailDraftReview({
		draftId: draft.id,
		ownerUserId: userId,
		encryptedReview: parsed.value.encrypted_review
	});
	if (!updated) {
		return json({ error: 'Draft is no longer editable' }, { status: 409 });
	}

	return json({ draft: updated });
};
