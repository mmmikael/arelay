import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArtifact } from '$lib/server/db';
import { getObjectBytes } from '$lib/server/s3';
import { routeJsonError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ locals, params }) => {
	const artifact = await getArtifact(params.id, locals.user!.id);
	if (!artifact) {
		return routeJsonError(locals, 404, 'Artifact not found');
	}
	if (artifact.encryption_version !== 'e2ee-v1' || !artifact.encrypted_payload) {
		return routeJsonError(locals, 400, 'Artifact is not end-to-end encrypted');
	}

	const bytes = await getObjectBytes(artifact.storage_key);
	return new Response(Buffer.from(bytes), {
		headers: {
			'Content-Type': 'application/octet-stream',
			// Artifacts are insert-only: the ciphertext for an id never changes,
			// so the browser can keep it for the session without revalidating.
			'Cache-Control': 'private, max-age=31536000, immutable'
		}
	});
};
