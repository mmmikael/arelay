import { zip } from 'fflate';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveFilenameForSession, uniqueZipFilename } from '$lib/artifacts';
import { getSession, listArtifacts } from '$lib/server/db';
import { getObjectBytes } from '$lib/server/s3';

export const GET: RequestHandler = async ({ locals, params }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
	}

	const session = await getSession(sessionId, locals.user!.id);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	const artifacts = await listArtifacts(sessionId, locals.user!.id);
	if (artifacts.length === 0) {
		return json({ error: 'No artifacts in this session' }, { status: 404 });
	}

	const files: Record<string, Uint8Array> = {};
	const used = new Set<string>();

	const downloaded = await Promise.all(
		artifacts.map(async (artifact) => ({
			name: uniqueZipFilename(artifact.filename, used),
			bytes: await getObjectBytes(artifact.storage_key)
		}))
	);
	for (const { name, bytes } of downloaded) {
		files[name] = bytes;
	}

	const zipBytes = await new Promise<Uint8Array>((resolve, reject) => {
		zip(files, { level: 6 }, (error, data) => {
			if (error) reject(error);
			else resolve(data);
		});
	});

	const filename = archiveFilenameForSession(session.title);

	return new Response(Buffer.from(zipBytes), {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`
		}
	});
};
