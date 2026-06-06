import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { isEmailReviewRelayEnabled } from '$lib/plugins';
import { getSession, listArtifacts } from '$lib/server/db';
import {
	getEmailDraftBySessionId,
	getSessionDeliveryType,
	getUserCloudflareEmail
} from '../../../plugins/email-review-relay/db';
import { previewKindFor } from '$lib/artifacts';
import { sanitizePreviewHtml } from '$lib/preview-sanitize';
import { getObjectText } from '$lib/server/s3';
import { marked } from 'marked';

type InlinePreviewResult = {
	artifactId: string;
	filename: string;
	kind: 'markdown' | 'html';
	doc: string;
};

async function loadInlinePreview(
	artifactId: string,
	filename: string,
	storageKey: string,
	kind: 'markdown' | 'html'
): Promise<InlinePreviewResult> {
	const text = await getObjectText(storageKey);
	const doc =
		kind === 'markdown'
			? sanitizePreviewHtml(await marked.parse(text, { gfm: true, breaks: true }))
			: sanitizePreviewHtml(text);
	return { artifactId, filename, kind, doc };
}

export const load: PageServerLoad = async ({ locals, params, depends }) => {
	depends('inbox:session');

	const [session, artifacts] = await Promise.all([
		getSession(params.sessionId, locals.user!.id),
		listArtifacts(params.sessionId, locals.user!.id)
	]);

	if (!session) {
		throw error(404, 'Session not found');
	}

	const mappedArtifacts = artifacts.map((artifact) => ({
		...artifact,
		size_bytes: Number(artifact.size_bytes),
		previewKind:
			artifact.encryption_version === 'e2ee-v1'
				? 'none'
				: previewKindFor(artifact.filename, artifact.content_type)
	}));

	const inlineArtifact =
		mappedArtifacts.length === 1 && mappedArtifacts[0].encryption_version !== 'e2ee-v1'
			? mappedArtifacts[0]
			: null;
	const inlineKind =
		inlineArtifact?.previewKind === 'markdown' || inlineArtifact?.previewKind === 'html'
			? inlineArtifact.previewKind
			: null;

	const inlinePreview =
		inlineArtifact && inlineKind
			? loadInlinePreview(
					inlineArtifact.id,
					inlineArtifact.filename,
					inlineArtifact.storage_key,
					inlineKind
				)
			: null;

	let emailDraft = null;
	let cloudflareEmailConfigured = false;
	if (isEmailReviewRelayEnabled()) {
		const deliveryType = await getSessionDeliveryType(params.sessionId, locals.user!.id);
		if (deliveryType === 'email_draft') {
			emailDraft = await getEmailDraftBySessionId(params.sessionId, locals.user!.id);
		}
		cloudflareEmailConfigured = Boolean(await getUserCloudflareEmail(locals.user!.id));
	}

	return {
		session,
		artifacts: mappedArtifacts,
		inlinePreview: emailDraft ? null : inlinePreview,
		plugins: {
			emailReviewRelay: isEmailReviewRelayEnabled()
		},
		emailDraft,
		cloudflareEmailConfigured
	};
};
