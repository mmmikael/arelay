import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArtifact } from '$lib/server/db';
import { e2eeOnlyResponse } from '$lib/server/e2ee-policy';

export const GET: RequestHandler = async ({ locals, params }) => {
	const artifact = await getArtifact(params.id, locals.user!.id);
	if (!artifact) {
		return json({ error: 'Artifact not found' }, { status: 404 });
	}

	return e2eeOnlyResponse('Artifact download requires client-side decrypt via /api/artifacts/{id}/ciphertext.');
};
