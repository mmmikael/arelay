import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getArtifact } from '$lib/server/db';
import { generateDownloadUrl, getObjectText } from '$lib/server/s3';
import { previewKindFor } from '$lib/artifacts';
import { marked } from 'marked';

export const GET: RequestHandler = async ({ locals, params }) => {
	const artifact = await getArtifact(params.id, locals.user!.id);
	if (!artifact) {
		return json({ error: 'Artifact not found' }, { status: 404 });
	}

	const kind = previewKindFor(artifact.filename, artifact.content_type);

	if (kind === 'markdown' || kind === 'text') {
		const text = await getObjectText(artifact.storage_key);
		const content =
			kind === 'markdown'
				? await marked.parse(text, { gfm: true, breaks: true })
				: `<pre>${escapeHtml(text)}</pre>`;
		return json({
			kind,
			filename: artifact.filename,
			contentType: artifact.content_type,
			content
		});
	}

	const previewUrl = await generateDownloadUrl(
		artifact.storage_key,
		artifact.filename,
		artifact.content_type,
		300,
		{ inline: true }
	);

	return json({
		kind,
		filename: artifact.filename,
		contentType: artifact.content_type,
		previewUrl
	});
};

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
