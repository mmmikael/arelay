import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArtifact } from '$lib/server/db';
import { generateDownloadUrl } from '$lib/server/s3';

export const GET: RequestHandler = async ({ locals, params }) => {
	const artifact = await getArtifact(params.id, locals.user!.id);
	if (!artifact) {
		return json({ error: 'Artifact not found' }, { status: 404 });
	}

	const downloadUrl = await generateDownloadUrl(
		artifact.storage_key,
		artifact.filename,
		artifact.content_type,
		300,
		{ inline: false }
	);

	return json({ downloadUrl, filename: artifact.filename });
};
