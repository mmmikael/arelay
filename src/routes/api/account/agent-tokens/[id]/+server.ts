import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { revokeAgentApiToken } from '$lib/server/db';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const revoked = await revokeAgentApiToken(locals.user!.id, params.id);
	if (!revoked) {
		return json({ error: 'Token not found' }, { status: 404 });
	}
	return json({ ok: true });
};
