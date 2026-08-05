import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { routeJsonError, routeLogAndJsonError } from '$lib/server/api-error';
import { isBillingEnabled, stripeSecretKey } from '$lib/server/billing/config';
import { getBillingAccount } from '$lib/server/billing/db';
import { createBillingPortalSession } from '$lib/server/billing/stripe-api';

export const POST: RequestHandler = async ({ locals, url }) => {
	if (!isBillingEnabled()) {
		return routeJsonError(locals, 404, 'Billing is not enabled on this deployment.');
	}

	const account = await getBillingAccount(locals.user!.id);
	if (!account?.stripe_customer_id) {
		return routeJsonError(locals, 409, 'No billing history for this account yet.');
	}

	try {
		const session = await createBillingPortalSession({
			secretKey: stripeSecretKey()!,
			customerId: account.stripe_customer_id,
			returnUrl: `${url.origin}/portal/account`
		});
		return json({ url: session.url });
	} catch (err) {
		return routeLogAndJsonError(locals, 502, 'Could not open the billing portal. Try again shortly.', err);
	}
};
