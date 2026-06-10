import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isEmailReviewRelayEnabled } from '$lib/plugins';
import { toSessionView } from '$lib/session-view';
import { getSession, updateEncryptedSession, type JsonObject } from '$lib/server/db';
import {
	isE2eePolicyResponse,
	isEncryptedEnvelope,
	rejectPlaintextPayload,
	requireOwnerE2eeForAgent
} from '$lib/server/e2ee-policy';
import { routeJsonError } from '$lib/server/api-error';
import {
	getEmailDraftBySessionId,
	getSessionDeliveryType,
	toAgentEmailDraftView
} from '$plugins/email-review-relay/server';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return routeJsonError(locals, 400, 'Session id required');
	}

	const policy = await requireOwnerE2eeForAgent(locals.agentUser!.id);
	if (isE2eePolicyResponse(policy)) {
		return policy;
	}

	const body = (await request.json()) as {
		encrypted?: boolean;
		encrypted_title?: JsonObject;
		encrypted_summary?: JsonObject | null;
	};

	if (!body.encrypted) {
		return rejectPlaintextPayload();
	}

	if (!isEncryptedEnvelope(body.encrypted_title)) {
		return routeJsonError(locals, 400, 'encrypted_title envelope required');
	}

	if (
		body.encrypted_summary !== undefined &&
		body.encrypted_summary !== null &&
		!isEncryptedEnvelope(body.encrypted_summary)
	) {
		return routeJsonError(locals, 400, 'encrypted_summary must be a valid envelope when provided');
	}

	const session = await updateEncryptedSession(sessionId, locals.agentUser!.id, {
		encryptedTitle: body.encrypted_title,
		encryptedSummary: body.encrypted_summary
	});

	if (!session) {
		return routeJsonError(locals, 404, 'Session not found');
	}

	return json({ session: toSessionView(session) });
};

export const GET: RequestHandler = async ({ locals, params }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return routeJsonError(locals, 400, 'Session id required');
	}

	const session = await getSession(sessionId, locals.agentUser!.id);
	if (!session) {
		return routeJsonError(locals, 404, 'Session not found');
	}

	const sessionView = toSessionView(session);

	if (!isEmailReviewRelayEnabled()) {
		return json({ session: sessionView });
	}

	const deliveryType = await getSessionDeliveryType(sessionId, locals.agentUser!.id);
	if (deliveryType !== 'email_draft') {
		return json({ session: sessionView });
	}

	const draft = await getEmailDraftBySessionId(sessionId, locals.agentUser!.id);
	return json({
		session: sessionView,
		email_draft: draft ? toAgentEmailDraftView(draft) : null
	});
};
