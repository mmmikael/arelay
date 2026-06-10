import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSession } from '$lib/server/db';
import { e2eeOnlyResponse } from '$lib/server/e2ee-policy';
import { routeJsonError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ locals, params }) => {
	const session = await getSession(params.id, locals.user!.id);
	if (!session) {
		return routeJsonError(locals, 404, 'Session not found');
	}

	return e2eeOnlyResponse(
		'Download artifacts individually; bulk archive is not available for encrypted deliveries.'
	);
};
