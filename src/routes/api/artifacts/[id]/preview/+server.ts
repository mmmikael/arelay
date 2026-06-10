import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArtifact } from '$lib/server/db';
import { e2eeOnlyResponse } from '$lib/server/e2ee-policy';
import { routeJsonError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ locals, params }) => {
	const artifact = await getArtifact(params.id, locals.user!.id);
	if (!artifact) {
		return routeJsonError(locals, 404, 'Artifact not found');
	}

	return e2eeOnlyResponse('Artifact preview requires client-side decrypt via /api/artifacts/{id}/ciphertext.');
};
