import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getSession } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';
import {
	getEmailDraftBySessionId,
	getSessionDeliveryType,
	parseEmailDraftApproveFields,
	sendApprovedEmailDraft,
	transitionEmailDraftStatus,
	saveEmailDraftSentSnapshot
} from '$plugins/email-review-relay/server';

const APPROVABLE_STATUSES = new Set(['pending', 'failed']);

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
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
	const parsed = parseEmailDraftApproveFields(body);
	if (!parsed.ok) {
		return routeJsonError(locals, 400, parsed.error);
	}
	const approveFields = parsed.value;
	const sendFields = {
		to: approveFields.to,
		from: approveFields.from,
		subject: approveFields.subject,
		html: approveFields.html,
		text: approveFields.text
	};

	const approved = await transitionEmailDraftStatus({
		draftId: draft.id,
		ownerUserId: userId,
		expectedStatus: draft.status as 'pending' | 'failed',
		nextStatus: 'approved',
		reviewedAt: new Date(),
		sendError: null
	});
	if (!approved) {
		return routeJsonError(locals, 409, 'Draft is no longer pending');
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

	if (sent && approveFields.encrypted_sent) {
		await saveEmailDraftSentSnapshot({
			draftId: sent.id,
			ownerUserId: userId,
			encryptedSent: approveFields.encrypted_sent
		});
	}

	return json({ draft: sent });
};
