import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArtifact } from '$lib/server/db';
import { getObjectBytes } from '$lib/server/s3';

export const GET: RequestHandler = async ({ locals, params }) => {
	const artifact = await getArtifact(params.id, locals.user!.id);
	if (!artifact) {
		return json({ error: 'Artifact not found' }, { status: 404 });
	}
	if (artifact.encryption_version !== 'e2ee-v1' || !artifact.encrypted_payload) {
		return json({ error: 'Artifact is not end-to-end encrypted' }, { status: 400 });
	}

	const bytes = await getObjectBytes(artifact.storage_key);
	return new Response(Buffer.from(bytes), {
		headers: {
			'Content-Type': 'application/octet-stream',
			'Cache-Control': 'private, max-age=60'
		}
	});
};
