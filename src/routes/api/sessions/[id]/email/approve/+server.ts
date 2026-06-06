import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getSession } from '$lib/server/db';
import {
	getEmailDraftBySessionId,
	getSessionDeliveryType,
	parseEmailDraftSendFields,
	sendApprovedEmailDraft,
	transitionEmailDraftStatus
} from '$plugins/email-review-relay/server';

const APPROVABLE_STATUSES = new Set(['pending', 'failed']);

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
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
	if (!APPROVABLE_STATUSES.has(draft.status)) {
		return json({ error: `Draft is already ${draft.status}` }, { status: 409 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json(
			{ error: 'Decrypted email fields are required to approve an encrypted draft.' },
			{ status: 400 }
		);
	}
	const parsed = parseEmailDraftSendFields(body);
	if (!parsed.ok) {
		return json({ error: parsed.error }, { status: 400 });
	}
	const sendFields = parsed.value;

	const approved = await transitionEmailDraftStatus({
		draftId: draft.id,
		ownerUserId: userId,
		expectedStatus: draft.status as 'pending' | 'failed',
		nextStatus: 'approved',
		reviewedAt: new Date(),
		sendError: null
	});
	if (!approved) {
		return json({ error: 'Draft is no longer pending' }, { status: 409 });
	}

	try {
		await sendApprovedEmailDraft({
			userId,
			draft: approved,
			fields: sendFields,
			origin: url.origin
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Email send failed';
		const status = message.includes('not configured') ? 428 : 502;
		const failed = await transitionEmailDraftStatus({
			draftId: approved.id,
			ownerUserId: userId,
			expectedStatus: 'approved',
			nextStatus: 'failed',
			sendError: message
		});
		return json(
			{
				error: message,
				draft: failed ?? approved
			},
			{ status }
		);
	}

	const sent = await transitionEmailDraftStatus({
		draftId: approved.id,
		ownerUserId: userId,
		expectedStatus: 'approved',
		nextStatus: 'sent',
		sentAt: new Date(),
		sendError: null
	});

	return json({ draft: sent });
};
