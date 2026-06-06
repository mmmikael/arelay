import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isEmailReviewRelayEnabled } from '$lib/plugins';
import { getSession, updateEncryptedSession, type JsonObject } from '$lib/server/db';
import {
	isE2eePolicyResponse,
	isEncryptedEnvelope,
	rejectPlaintextPayload,
	requireOwnerE2eeForAgent
} from '$lib/server/e2ee-policy';
import {
	getEmailDraftBySessionId,
	getSessionDeliveryType,
	toAgentEmailDraftView
} from '$plugins/email-review-relay/server';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
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
		return json({ error: 'encrypted_title envelope required' }, { status: 400 });
	}

	if (
		body.encrypted_summary !== undefined &&
		body.encrypted_summary !== null &&
		!isEncryptedEnvelope(body.encrypted_summary)
	) {
		return json({ error: 'encrypted_summary must be a valid envelope when provided' }, { status: 400 });
	}

	const session = await updateEncryptedSession(sessionId, locals.agentUser!.id, {
		encryptedTitle: body.encrypted_title,
		encryptedSummary: body.encrypted_summary
	});

	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	return json({ session });
};

export const GET: RequestHandler = async ({ locals, params }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
	}

	const session = await getSession(sessionId, locals.agentUser!.id);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	if (!isEmailReviewRelayEnabled()) {
		return json({ session });
	}

	const deliveryType = await getSessionDeliveryType(sessionId, locals.agentUser!.id);
	if (deliveryType !== 'email_draft') {
		return json({ session });
	}

	const draft = await getEmailDraftBySessionId(sessionId, locals.agentUser!.id);
	return json({
		session,
		email_draft: draft ? toAgentEmailDraftView(draft) : null
	});
};
