import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getSession } from '$lib/server/db';
import {
	getEmailDraftBySessionId,
	getUserCloudflareEmail,
	transitionEmailDraftStatus
} from '../../../../../../plugins/email-review-relay/db';
import {
	emailDraftSendFieldsFromRecord,
	sendApprovedEmailDraft
} from '../../../../../../plugins/email-review-relay/send';
import { isEncryptedEmailDraft } from '../../../../../../plugins/email-review-relay/types';
import { parseEmailDraftSendFields } from '../../../../../../plugins/email-review-relay/validate';

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	requirePlugin(EMAIL_REVIEW_RELAY_PLUGIN_ID);

	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
	}

	const userId = locals.user!.id;
	const session = await getSession(sessionId, userId);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	const draft = await getEmailDraftBySessionId(sessionId, userId);
	if (!draft) {
		return json({ error: 'Email draft not found' }, { status: 404 });
	}
	if (draft.status !== 'pending') {
		return json({ error: `Draft is already ${draft.status}` }, { status: 409 });
	}

	const credentials = await getUserCloudflareEmail(userId);
	if (!credentials) {
		return json(
			{ error: 'Cloudflare Email Sending is not configured for this account.' },
			{ status: 428 }
		);
	}

	let sendFields;
	if (isEncryptedEmailDraft(draft)) {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return json(
				{ error: 'Decrypted email fields are required to approve an encrypted draft.' },
				{ status: 400 }
			);
		}
		const parsed = parseEmailDraftSendFields(body);
		if (!parsed.ok) {
			return json({ error: parsed.error }, { status: 400 });
		}
		sendFields = parsed.value;
	} else {
		try {
			sendFields = emailDraftSendFieldsFromRecord(draft);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Email draft is missing send fields';
			return json({ error: message }, { status: 400 });
		}
	}

	const approved = await transitionEmailDraftStatus({
		draftId: draft.id,
		ownerUserId: userId,
		expectedStatus: 'pending',
		nextStatus: 'approved',
		reviewedAt: new Date()
	});
	if (!approved) {
		return json({ error: 'Draft is no longer pending' }, { status: 409 });
	}

	try {
		await sendApprovedEmailDraft({
			userId,
			draft: approved,
			fields: sendFields,
			origin: url.origin
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Email send failed';
		const failed = await transitionEmailDraftStatus({
			draftId: approved.id,
			ownerUserId: userId,
			expectedStatus: 'approved',
			nextStatus: 'failed',
			sendError: message
		});
		return json(
			{
				error: message,
				draft: failed ?? approved
			},
			{ status: 502 }
		);
	}

	const sent = await transitionEmailDraftStatus({
		draftId: approved.id,
		ownerUserId: userId,
		expectedStatus: 'approved',
		nextStatus: 'sent',
		sentAt: new Date()
	});

	return json({ draft: sent });
};
