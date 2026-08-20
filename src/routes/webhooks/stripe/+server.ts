import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isBillingEnabled, stripeWebhookSecret } from '$lib/server/billing/config';
import { applyPlanUpdate, getBillingAccountByStripeCustomerId } from '$lib/server/billing/db';
import {
	parseStripeEvent,
	planUpdateFromEvent,
	verifyStripeWebhookSignature
} from '$lib/server/billing/webhook';

// Stripe calls this endpoint directly — it is authenticated by the webhook
// signature, not a session cookie, which is why it lives outside /api.
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isBillingEnabled()) {
		return json({ error: 'Billing is not enabled on this deployment.' }, { status: 404 });
	}

	const payload = await request.text();
	const signature = request.headers.get('stripe-signature');
	if (!verifyStripeWebhookSignature(payload, signature, stripeWebhookSecret()!)) {
		locals.log.warn('stripe webhook signature verification failed');
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	const event = parseStripeEvent(payload);
	if (!event) {
		return json({ error: 'Invalid event payload' }, { status: 400 });
	}

	const action = planUpdateFromEvent(event);
	if (!action) {
		// Unhandled event types are acknowledged so Stripe does not retry them.
		return json({ received: true });
	}

	let userId = action.userId;
	if (!userId && action.stripeCustomerId) {
		const account = await getBillingAccountByStripeCustomerId(action.stripeCustomerId);
		userId = account?.user_id ?? null;
	}
	if (!userId) {
		locals.log.warn(
			{ eventType: event.type, eventId: event.id, stripeCustomerId: action.stripeCustomerId },
			'stripe webhook event did not resolve to a user'
		);
		return json({ received: true });
	}

	await applyPlanUpdate(userId, action.stripeCustomerId, action.update);
	locals.log.info(
		{ eventType: event.type, eventId: event.id, userId, plan: action.update.plan },
		'billing plan updated from stripe webhook'
	);
	return json({ received: true });
};
