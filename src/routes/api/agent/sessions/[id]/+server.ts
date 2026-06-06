import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isEmailReviewRelayEnabled } from '$lib/plugins';
import { getSession, updateEncryptedSession, updateSession, type JsonObject } from '$lib/server/db';
import {
	getEmailDraftBySessionId,
	getSessionDeliveryType
} from '../../../../../plugins/email-review-relay/db';
import { toAgentEmailDraftView } from '../../../../../plugins/email-review-relay/types';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
	}

	const body = (await request.json()) as {
		title?: string;
		summary?: string | null;
		encrypted?: boolean;
		encrypted_title?: JsonObject;
		encrypted_summary?: JsonObject | null;
	};
	if (body.encrypted) {
		const session = await updateEncryptedSession(sessionId, locals.agentUser!.id, {
			encryptedTitle: body.encrypted_title,
			encryptedSummary: body.encrypted_summary
		});

		if (!session) {
			return json({ error: 'Session not found' }, { status: 404 });
		}

		return json({ session });
	}

	const session = await updateSession(sessionId, locals.agentUser!.id, {
		title: body.title?.trim(),
		summary: body.summary
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
