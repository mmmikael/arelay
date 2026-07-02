import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SPEND_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { getSession } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';
import {
	executeApprovedSpendRequest,
	getSessionDeliveryType,
	getSpendRequestBySessionId,
	parseSpendRequestApproveFields,
	saveSpendRequestReceipt,
	transitionSpendRequestStatus
} from '$plugins/spend-review-relay/server';

const APPROVABLE_STATUSES = new Set(['pending', 'failed']);

export const POST: RequestHandler = async ({ locals, params, request, url }) => {
	requirePlugin(SPEND_REVIEW_RELAY_PLUGIN_ID);

	const sessionId = params.id;
	if (!sessionId) {
		return routeJsonError(locals, 400, 'Session id required');
	}

	const userId = locals.user!.id;
	const session = await getSession(sessionId, userId);
	if (!session) {
		return routeJsonError(locals, 404, 'Session not found');
	}

	const deliveryType = await getSessionDeliveryType(sessionId, userId);
	if (deliveryType !== 'spend_request') {
		return routeJsonError(locals, 404, 'Session is not a spend request');
	}

	const spendRequest = await getSpendRequestBySessionId(sessionId, userId);
	if (!spendRequest) {
		return routeJsonError(locals, 404, 'Spend request not found');
	}
	if (!APPROVABLE_STATUSES.has(spendRequest.status)) {
		return json({ error: `Spend request is already ${spendRequest.status}` }, { status: 409 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json(
			{ error: 'Decrypted spend fields are required to approve an encrypted request.' },
			{ status: 400 }
		);
	}
	const parsed = parseSpendRequestApproveFields(body);
	if (!parsed.ok) {
		return routeJsonError(locals, 400, parsed.error);
	}
	const approveFields = parsed.value;
	const chargeFields = {
		payee: approveFields.payee,
		amount_minor: approveFields.amount_minor,
		currency: approveFields.currency,
		description: approveFields.description
	};

	const approved = await transitionSpendRequestStatus({
		requestId: spendRequest.id,
		ownerUserId: userId,
		expectedStatus: spendRequest.status as 'pending' | 'failed',
		nextStatus: 'approved',
		reviewedAt: new Date(),
		chargeError: null
	});
	if (!approved) {
		return routeJsonError(locals, 409, 'Spend request is no longer pending');
	}

	let charge;
	try {
		charge = await executeApprovedSpendRequest({
			userId,
			request: approved,
			fields: chargeFields,
			origin: url.origin
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Stripe charge failed';
		// Use 4xx, not 5xx: the hosting edge replaces 5xx bodies with its own HTML error
		// page, which would hide the real charge error from the reviewer. 422 keeps JSON intact.
		const status = message.includes('not configured') ? 428 : 422;
		const failed = await transitionSpendRequestStatus({
			requestId: approved.id,
			ownerUserId: userId,
			expectedStatus: 'approved',
			nextStatus: 'failed',
			chargeError: message
		});
		return json(
			{
				error: message,
				request: failed ?? approved
			},
			{ status }
		);
	}

	const paid = await transitionSpendRequestStatus({
		requestId: approved.id,
		ownerUserId: userId,
		expectedStatus: 'approved',
		nextStatus: 'paid',
		paidAt: new Date(),
		paymentIntentId: charge.payment_intent_id,
		chargeError: null
	});

	if (paid && approveFields.encrypted_receipt) {
		await saveSpendRequestReceipt({
			requestId: paid.id,
			ownerUserId: userId,
			encryptedReceipt: approveFields.encrypted_receipt
		});
	}

	return json({ request: paid, charge });
};
