import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { revokeAgentApiToken } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const revoked = await revokeAgentApiToken(locals.user!.id, params.id);
	if (!revoked) {
		return routeJsonError(locals, 404, 'Token not found');
	}
	return json({ ok: true });
};
