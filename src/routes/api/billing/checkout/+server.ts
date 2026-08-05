import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { routeJsonError, routeLogAndJsonError } from '$lib/server/api-error';
import {
	billingPriceIds,
	foundingCap,
	isBillingEnabled,
	stripeAutomaticTaxEnabled,
	stripeSecretKey
} from '$lib/server/billing/config';
import {
	countFoundingAccounts,
	getBillingAccount,
	setStripeCustomerId
} from '$lib/server/billing/db';
import {
	buildCheckoutSessionParams,
	createCheckoutSession,
	createStripeCustomer,
	type CheckoutPlan
} from '$lib/server/billing/stripe-api';

type CheckoutRequestBody = {
	plan?: string;
	interval?: string;
};

function resolvePrice(body: CheckoutRequestBody): {
	plan: CheckoutPlan;
	mode: 'subscription' | 'payment';
	priceId: string;
} | null {
	const prices = billingPriceIds();
	if (!prices) return null;
	if (body.plan === 'founding') {
		return { plan: 'founding', mode: 'payment', priceId: prices.founding };
	}
	if (body.plan === 'pro') {
		const priceId = body.interval === 'yearly' ? prices.proYearly : prices.proMonthly;
		return { plan: 'pro', mode: 'subscription', priceId };
	}
	return null;
}

export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!isBillingEnabled()) {
		return routeJsonError(locals, 404, 'Billing is not enabled on this deployment.');
	}

	let body: CheckoutRequestBody;
	try {
		body = (await request.json()) as CheckoutRequestBody;
	} catch {
		return routeJsonError(locals, 400, 'Invalid JSON body');
	}

	const selection = resolvePrice(body);
	if (!selection) {
		return routeJsonError(locals, 400, 'plan must be "pro" (interval monthly|yearly) or "founding".');
	}

	const userId = locals.user!.id;
	const secretKey = stripeSecretKey()!;

	const account = await getBillingAccount(userId);
	if (account && account.plan !== 'free') {
		return routeJsonError(locals, 409, 'This account already has an active plan. Use Manage billing.');
	}

	if (selection.plan === 'founding') {
		const sold = await countFoundingAccounts();
		if (sold >= foundingCap()) {
			return routeJsonError(locals, 409, 'All founding licenses have been claimed.');
		}
	}

	try {
		let customerId = account?.stripe_customer_id ?? null;
		if (!customerId) {
			const customer = await createStripeCustomer({
				secretKey,
				email: locals.user!.email,
				userId
			});
			customerId = customer.id;
			await setStripeCustomerId(userId, customerId);
		}

		const params = buildCheckoutSessionParams({
			customerId,
			priceId: selection.priceId,
			mode: selection.mode,
			plan: selection.plan,
			userId,
			origin: url.origin,
			automaticTax: stripeAutomaticTaxEnabled()
		});
		const session = await createCheckoutSession({ secretKey, params });
		return json({ url: session.url });
	} catch (err) {
		return routeLogAndJsonError(locals, 502, 'Could not start checkout. Try again shortly.', err);
	}
};
