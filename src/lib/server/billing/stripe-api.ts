import { CHECKOUT_INTEGRATION_IDENTIFIER, STRIPE_API_BASE, STRIPE_API_VERSION } from './config';

type StripeErrorBody = { error?: { message?: string } };

function parseStripeBody<T>(rawBody: string): (T & StripeErrorBody) | null {
	try {
		return rawBody ? (JSON.parse(rawBody) as T & StripeErrorBody) : null;
	} catch {
		return null;
	}
}

async function stripePost<T>(input: {
	secretKey: string;
	path: string;
	params: URLSearchParams;
	idempotencyKey?: string;
}): Promise<T> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${input.secretKey}`,
		'Content-Type': 'application/x-www-form-urlencoded',
		'Stripe-Version': STRIPE_API_VERSION
	};
	if (input.idempotencyKey) {
		headers['Idempotency-Key'] = input.idempotencyKey;
	}
	const response = await fetch(`${STRIPE_API_BASE}${input.path}`, {
		method: 'POST',
		headers,
		body: input.params.toString()
	});
	const rawBody = await response.text();
	const result = parseStripeBody<T>(rawBody);
	if (!response.ok) {
		// Never log the secret key; the raw Stripe body is safe and makes failures diagnosable.
		console.error(
			`[billing] Stripe ${input.path} failed: status=${response.status} body=${rawBody.slice(0, 2000)}`
		);
		throw new Error(result?.error?.message || `Stripe request failed (${response.status})`);
	}
	if (!result) {
		throw new Error(`Stripe returned an unreadable response for ${input.path}`);
	}
	return result;
}

async function stripeGet<T>(input: { secretKey: string; path: string }): Promise<T> {
	const response = await fetch(`${STRIPE_API_BASE}${input.path}`, {
		headers: {
			Authorization: `Bearer ${input.secretKey}`,
			'Stripe-Version': STRIPE_API_VERSION
		}
	});
	const rawBody = await response.text();
	const result = parseStripeBody<T>(rawBody);
	if (!response.ok) {
		console.error(
			`[billing] Stripe ${input.path} failed: status=${response.status} body=${rawBody.slice(0, 2000)}`
		);
		throw new Error(result?.error?.message || `Stripe request failed (${response.status})`);
	}
	if (!result) {
		throw new Error(`Stripe returned an unreadable response for ${input.path}`);
	}
	return result;
}

export async function createStripeCustomer(input: {
	secretKey: string;
	email: string;
	userId: string;
}): Promise<{ id: string }> {
	const params = new URLSearchParams();
	params.set('email', input.email);
	params.set('metadata[arelay_user_id]', input.userId);
	return stripePost<{ id: string }>({
		secretKey: input.secretKey,
		path: '/v1/customers',
		params,
		// Stops a double-clicked upgrade from creating two customers.
		idempotencyKey: `arelay_customer_${input.userId}`
	});
}

export type CheckoutPlan = 'pro' | 'founding';

export function buildCheckoutSessionParams(input: {
	customerId: string;
	priceId: string;
	mode: 'subscription' | 'payment';
	plan: CheckoutPlan;
	userId: string;
	origin: string;
	automaticTax: boolean;
}): URLSearchParams {
	const params = new URLSearchParams();
	params.set('mode', input.mode);
	params.set('customer', input.customerId);
	params.set('client_reference_id', input.userId);
	params.set('line_items[0][price]', input.priceId);
	params.set('line_items[0][quantity]', '1');
	params.set('success_url', `${input.origin}/portal/account?checkout=success`);
	params.set('cancel_url', `${input.origin}/pricing?checkout=cancelled`);
	params.set('allow_promotion_codes', 'true');
	params.set('integration_identifier', CHECKOUT_INTEGRATION_IDENTIFIER);
	params.set('metadata[arelay_user_id]', input.userId);
	params.set('metadata[arelay_plan]', input.plan);
	// Payment methods are intentionally not restricted here: Stripe picks
	// eligible methods dynamically from Dashboard settings.
	if (input.mode === 'subscription') {
		params.set('subscription_data[metadata][arelay_user_id]', input.userId);
	} else {
		params.set('invoice_creation[enabled]', 'true');
		params.set('payment_intent_data[metadata][arelay_user_id]', input.userId);
	}
	if (input.automaticTax) {
		params.set('automatic_tax[enabled]', 'true');
		params.set('customer_update[address]', 'auto');
	}
	return params;
}

export async function createCheckoutSession(input: {
	secretKey: string;
	params: URLSearchParams;
}): Promise<{ id: string; url: string }> {
	const session = await stripePost<{ id: string; url?: string | null }>({
		secretKey: input.secretKey,
		path: '/v1/checkout/sessions',
		params: input.params
	});
	if (!session.url) {
		throw new Error('Stripe did not return a checkout URL.');
	}
	return { id: session.id, url: session.url };
}

export function buildPortalSessionParams(input: {
	customerId: string;
	returnUrl: string;
	configurationId: string | null;
}): URLSearchParams {
	const params = new URLSearchParams();
	params.set('customer', input.customerId);
	params.set('return_url', input.returnUrl);
	// Omitted only when unconfigured, in which case Stripe falls back to the
	// account's default portal configuration.
	if (input.configurationId) {
		params.set('configuration', input.configurationId);
	}
	return params;
}

export async function createBillingPortalSession(input: {
	secretKey: string;
	customerId: string;
	returnUrl: string;
	configurationId?: string | null;
}): Promise<{ url: string }> {
	const params = buildPortalSessionParams({
		customerId: input.customerId,
		returnUrl: input.returnUrl,
		configurationId: input.configurationId ?? null
	});
	const session = await stripePost<{ url?: string | null }>({
		secretKey: input.secretKey,
		path: '/v1/billing_portal/sessions',
		params
	});
	if (!session.url) {
		throw new Error('Stripe did not return a billing portal URL.');
	}
	return { url: session.url };
}

export type StripePrice = {
	id: string;
	unit_amount: number | null;
	currency: string;
	recurring: { interval: string } | null;
};

export async function getStripePrice(secretKey: string, priceId: string): Promise<StripePrice> {
	return stripeGet<StripePrice>({
		secretKey,
		path: `/v1/prices/${encodeURIComponent(priceId)}`
	});
}
