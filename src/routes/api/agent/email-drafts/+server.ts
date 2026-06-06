import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getE2eeConfig } from '$lib/server/db';
import {
	createEmailDraft,
	getEmailDraftByIdempotencyKey,
	parseEmailDraftBody,
	toAgentEmailDraftView
} from '$plugins/email-review-relay/server';

function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}

export const POST: RequestHandler = async ({ locals, request }) => {
	requirePlugin(EMAIL_REVIEW_RELAY_PLUGIN_ID);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const parsed = parseEmailDraftBody(body);
	if (!parsed.ok) {
		return json({ error: parsed.error }, { status: 400 });
	}

	const ownerUserId = locals.agentUser!.id;
	const e2eeConfig = await getE2eeConfig(ownerUserId);

	if (parsed.encrypted) {
		if (!e2eeConfig) {
			return json(
				{ error: 'E2EE is not configured for this account. Enable encryption in the portal first.' },
				{ status: 428 }
			);
		}
	} else if (e2eeConfig) {
		return json(
			{
				error:
					'Plaintext email drafts are not allowed when E2EE is enabled. Submit encrypted: true drafts instead.'
			},
			{ status: 428 }
		);
	}

	if (parsed.value.idempotency_key) {
		const existing = await getEmailDraftByIdempotencyKey(
			ownerUserId,
			parsed.value.idempotency_key
		);
		if (existing) {
			return json(
				{
					session: existing.session,
					draft: toAgentEmailDraftView(existing.draft)
				},
				{ status: 200 }
			);
		}
	}

	const sessionId = crypto.randomUUID();
	const draftId = crypto.randomUUID();

	try {
		const created = await createEmailDraft({
			sessionId,
			draftId,
			ownerUserId,
			payload: parsed.value,
			encrypted: parsed.encrypted
		});

		return json(
			{
				session: created.session,
				draft: toAgentEmailDraftView(created.draft)
			},
			{ status: 201 }
		);
	} catch (err) {
		if (parsed.value.idempotency_key && isUniqueViolation(err)) {
			const existing = await getEmailDraftByIdempotencyKey(
				ownerUserId,
				parsed.value.idempotency_key
			);
			if (existing) {
				return json(
					{
						session: existing.session,
						draft: toAgentEmailDraftView(existing.draft)
					},
					{ status: 200 }
				);
			}
		}
		throw err;
	}
};
