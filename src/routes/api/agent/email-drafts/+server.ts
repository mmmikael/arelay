import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { toSessionView } from '$lib/session-view';
import {
	AGENT_SESSION_LIMIT_ERROR,
	reserveAgentSessionCreate
} from '$lib/server/agent-rate-limit';
import { buildRateLimitResponse } from '$lib/server/rate-limit';
import {
	isE2eePolicyResponse,
	requireOwnerE2eeForAgent
} from '$lib/server/e2ee-policy';
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
	const policy = await requireOwnerE2eeForAgent(ownerUserId);
	if (isE2eePolicyResponse(policy)) {
		return policy;
	}

	if (parsed.value.idempotency_key) {
		const existing = await getEmailDraftByIdempotencyKey(
			ownerUserId,
			parsed.value.idempotency_key
		);
		if (existing) {
			return json(
				{
					session: toSessionView(existing.session),
					draft: toAgentEmailDraftView(existing.draft)
				},
				{ status: 200 }
			);
		}
	}

	const sessionLimit = await reserveAgentSessionCreate(ownerUserId);
	if (!sessionLimit.ok) {
		return buildRateLimitResponse(sessionLimit.retryAfterSeconds, AGENT_SESSION_LIMIT_ERROR);
	}

	const sessionId = crypto.randomUUID();
	const draftId = crypto.randomUUID();

	try {
		const created = await createEmailDraft({
			sessionId,
			draftId,
			ownerUserId,
			payload: parsed.value
		});

		return json(
			{
				session: toSessionView(created.session),
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
						session: toSessionView(existing.session),
						draft: toAgentEmailDraftView(existing.draft)
					},
					{ status: 200 }
				);
			}
		}
		throw err;
	}
};
