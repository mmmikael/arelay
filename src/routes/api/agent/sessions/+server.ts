import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toSessionView } from '$lib/session-view';
import { createEncryptedSession, listSessions, type JsonObject } from '$lib/server/db';
import {
	isE2eePolicyResponse,
	isEncryptedEnvelope,
	rejectPlaintextPayload,
	requireOwnerE2eeForAgent
} from '$lib/server/e2ee-policy';

export const GET: RequestHandler = async ({ locals }) => {
	const sessions = await listSessions(locals.agentUser!.id);
	return json({ sessions: sessions.map(toSessionView) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const ownerUserId = locals.agentUser!.id;
	const policy = await requireOwnerE2eeForAgent(ownerUserId);
	if (isE2eePolicyResponse(policy)) {
		return policy;
	}

	let body: {
		encrypted?: boolean;
		encrypted_title?: JsonObject;
		encrypted_summary?: JsonObject | null;
	} = {};
	const contentType = request.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		body = await request.json();
	}

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

	const id = crypto.randomUUID();
	const session = await createEncryptedSession({
		id,
		ownerUserId,
		encryptedTitle: body.encrypted_title,
		encryptedSummary: body.encrypted_summary ?? null
	});

	return json({ session: toSessionView(session) }, { status: 201 });
};
