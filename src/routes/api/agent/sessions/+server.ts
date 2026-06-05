import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEncryptedSession, createSession, listSessions, type JsonObject } from '$lib/server/db';
import { defaultSessionTitle } from '$lib/artifacts';

export const GET: RequestHandler = async ({ locals }) => {
	const sessions = await listSessions(locals.agentUser!.id);
	return json({ sessions });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	let body: {
		title?: string;
		summary?: string | null;
		encrypted?: boolean;
		encrypted_title?: JsonObject;
		encrypted_summary?: JsonObject | null;
	} = {};
	const contentType = request.headers.get('content-type') ?? '';
	if (contentType.includes('application/json')) {
		body = await request.json();
	}

	const id = crypto.randomUUID();
	if (body.encrypted) {
		if (!body.encrypted_title) {
			return json({ error: 'encrypted_title is required for encrypted sessions' }, { status: 400 });
		}
		const session = await createEncryptedSession({
			id,
			ownerUserId: locals.agentUser!.id,
			encryptedTitle: body.encrypted_title,
			encryptedSummary: body.encrypted_summary ?? null
		});
		return json({ session }, { status: 201 });
	}

	const title = body.title?.trim() || defaultSessionTitle();
	const session = await createSession({
		id,
		ownerUserId: locals.agentUser!.id,
		title,
		summary: body.summary?.trim() || null
	});

	return json({ session }, { status: 201 });
};
