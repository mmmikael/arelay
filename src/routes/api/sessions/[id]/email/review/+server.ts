import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getSession } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';
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
	if (!REVIEWABLE_STATUSES.has(draft.status)) {
		return json({ error: `Draft is already ${draft.status}` }, { status: 409 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return routeJsonError(locals, 400, 'Invalid JSON body');
	}

	const parsed = parseEmailDraftReviewBody(body);
	if (!parsed.ok) {
		return routeJsonError(locals, 400, parsed.error);
	}

	const updated = await updateEmailDraftReview({
		draftId: draft.id,
		ownerUserId: userId,
		encryptedReview: parsed.value.encrypted_review
	});
	if (!updated) {
		return routeJsonError(locals, 409, 'Draft is no longer editable');
	}

	return json({ draft: updated });
};
