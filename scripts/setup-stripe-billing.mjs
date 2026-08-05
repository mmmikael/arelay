#!/usr/bin/env node
/**
 * Create the Stripe products, prices, and (optionally) the webhook endpoint
 * for hosted billing. Idempotent: products use fixed ids, prices use
 * lookup_keys, and the webhook endpoint is matched by URL.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=rk_test_... node scripts/setup-stripe-billing.mjs
 *   STRIPE_SECRET_KEY=rk_live_... BILLING_WEBHOOK_URL=https://arelay.app/webhooks/stripe \
 *     node scripts/setup-stripe-billing.mjs
 *
 * SITE_URL overrides the origin used for portal links when it differs from the
 * webhook URL's origin.
 *
 * Amounts (USD cents) can be overridden before first creation:
 *   PRO_MONTHLY_CENTS=900 PRO_YEARLY_CENTS=7900 FOUNDING_CENTS=7900
 *
 * Run against a sandbox/test key first. Use a restricted key (rk_) with write
 * access to Products, Prices, Customer portal, and Webhook Endpoints.
 */

const STRIPE_API_BASE = 'https://api.stripe.com';
const STRIPE_API_VERSION = '2026-06-24.dahlia';

const WEBHOOK_EVENTS = [
	'checkout.session.completed',
	'customer.subscription.created',
	'customer.subscription.updated',
	'customer.subscription.deleted'
];

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!secretKey) {
	console.error('STRIPE_SECRET_KEY is required (rk_test_/sk_test_ first, then live).');
	process.exit(1);
}
// Fail before the first API call rather than forwarding a bad value to Stripe and
// surfacing it as a confusing 401. Catches the common shell mistake where an
// interactive `read` swallows the following pasted line instead of the key.
if (!/^(sk|rk)_(test|live)_/.test(secretKey)) {
	// Log nothing derived from the value — not even its length. Reaching here means it
	// is not a Stripe key, so it may be some other secret pasted by mistake. The
	// value only picks which fixed message to print.
	const looksLikeShellText = /[\s'";|]/.test(secretKey);
	console.error(
		looksLikeShellText
			? 'STRIPE_SECRET_KEY contains whitespace or quotes, so it holds shell text\n' +
					'rather than a key — the prompt consumed the wrong line. Re-run the read\n' +
					'command on its own, wait for the prompt, then paste the key.'
			: 'STRIPE_SECRET_KEY does not start with sk_test_, rk_test_, sk_live_ or\n' +
					'rk_live_. Check that the whole key was copied.'
	);
	process.exit(1);
}
const liveMode = /_live_/.test(secretKey);

const amounts = {
	proMonthly: Number(process.env.PRO_MONTHLY_CENTS ?? 900),
	proYearly: Number(process.env.PRO_YEARLY_CENTS ?? 7900),
	founding: Number(process.env.FOUNDING_CENTS ?? 7900)
};

async function stripe(method, path, params) {
	const response = await fetch(`${STRIPE_API_BASE}${path}`, {
		method,
		headers: {
			Authorization: `Bearer ${secretKey}`,
			'Stripe-Version': STRIPE_API_VERSION,
			...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {})
		},
		body: params ? params.toString() : undefined
	});
	const body = await response.json().catch(() => null);
	if (!response.ok) {
		const message = body?.error?.message ?? `HTTP ${response.status}`;
		const error = new Error(`${method} ${path}: ${message}`);
		error.status = response.status;
		throw error;
	}
	return body;
}

async function ensureProduct(id, name, description) {
	try {
		const existing = await stripe('GET', `/v1/products/${id}`);
		console.log(`✓ product ${id} exists`);
		return existing;
	} catch (err) {
		if (err.status !== 404) throw err;
	}
	const params = new URLSearchParams();
	params.set('id', id);
	params.set('name', name);
	params.set('description', description);
	const created = await stripe('POST', '/v1/products', params);
	console.log(`+ created product ${id}`);
	return created;
}

async function findPriceByLookupKey(lookupKey) {
	const result = await stripe(
		'GET',
		`/v1/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&limit=1`
	);
	return result?.data?.[0] ?? null;
}

async function ensurePrice({ lookupKey, productId, unitAmount, interval }) {
	const existing = await findPriceByLookupKey(lookupKey);
	if (existing) {
		console.log(`✓ price ${lookupKey} exists (${existing.id})`);
		return existing;
	}
	const params = new URLSearchParams();
	params.set('product', productId);
	params.set('currency', 'usd');
	params.set('unit_amount', String(unitAmount));
	params.set('lookup_key', lookupKey);
	params.set('transfer_lookup_key', 'true');
	params.set('tax_behavior', 'exclusive');
	if (interval) {
		params.set('recurring[interval]', interval);
	}
	const created = await stripe('POST', '/v1/prices', params);
	console.log(`+ created price ${lookupKey} (${created.id})`);
	return created;
}

/**
 * Create (or reuse) a Customer Portal configuration and return its id.
 *
 * Portal sessions fall back to the account's *default* configuration when none is
 * passed, and that default only exists once it has been saved in the Dashboard.
 * Creating one here and passing it explicitly at runtime removes that manual
 * step — which otherwise fails only in live mode.
 */
async function ensurePortalConfiguration(siteOrigin) {
	const existing = await stripe('GET', '/v1/billing_portal/configurations?limit=100');
	const match = existing?.data?.find(
		(configuration) => configuration.metadata?.arelay_managed === 'true' && configuration.active
	);
	if (match) {
		console.log(`✓ portal configuration exists (${match.id})`);
		return match.id;
	}

	const params = new URLSearchParams();
	params.set('metadata[arelay_managed]', 'true');
	params.set('name', 'Agent Relay billing');
	params.set('features[invoice_history][enabled]', 'true');
	params.set('features[payment_method_update][enabled]', 'true');
	// Let customers keep their own details current, including a tax id for
	// business invoices, and an address (needed once Stripe Tax is enabled).
	params.set('features[customer_update][enabled]', 'true');
	params.set('features[customer_update][allowed_updates][0]', 'email');
	params.set('features[customer_update][allowed_updates][1]', 'address');
	params.set('features[customer_update][allowed_updates][2]', 'tax_id');
	// Cancel at period end: the customer keeps Pro for what they already paid for,
	// and the downgrade lands when Stripe sends subscription.deleted.
	params.set('features[subscription_cancel][enabled]', 'true');
	params.set('features[subscription_cancel][mode]', 'at_period_end');
	params.set('features[subscription_cancel][cancellation_reason][enabled]', 'true');
	for (const [index, reason] of [
		'too_expensive',
		'missing_features',
		'switched_service',
		'unused',
		'other'
	].entries()) {
		params.set(
			`features[subscription_cancel][cancellation_reason][options][${index}]`,
			reason
		);
	}
	// Deliberately not enabling features[subscription_update]: the API accepts
	// features[subscription_update][products] but neither stores nor returns it,
	// so price switching would appear enabled with no prices to switch to.
	// Monthly ↔ yearly changes are handled by cancel + re-subscribe for now.
	if (siteOrigin) {
		params.set('business_profile[privacy_policy_url]', `${siteOrigin}/privacy`);
		params.set('business_profile[terms_of_service_url]', `${siteOrigin}/terms`);
		params.set('default_return_url', `${siteOrigin}/portal/account`);
	}

	const created = await stripe('POST', '/v1/billing_portal/configurations', params);
	console.log(`+ created portal configuration (${created.id})`);
	return created.id;
}

async function ensureWebhookEndpoint(url) {
	const existing = await stripe('GET', '/v1/webhook_endpoints?limit=100');
	const match = existing?.data?.find((endpoint) => endpoint.url === url);
	if (match) {
		console.log(`✓ webhook endpoint exists for ${url}`);
		console.log(
			'  (its signing secret is only shown at creation — read it in the Dashboard if you lost it)'
		);
		return null;
	}
	const params = new URLSearchParams();
	params.set('url', url);
	WEBHOOK_EVENTS.forEach((eventType, index) => {
		params.set(`enabled_events[${index}]`, eventType);
	});
	const created = await stripe('POST', '/v1/webhook_endpoints', params);
	console.log(`+ created webhook endpoint for ${url}`);
	return created.secret ?? null;
}

console.log(`Setting up Stripe billing catalog (${liveMode ? 'LIVE' : 'test'} mode)…`);

const proProduct = await ensureProduct(
	'arelay_pro',
	'Agent Relay Pro',
	'Hosted Agent Relay Pro plan: 10 GB encrypted inbox storage and 100 MB artifacts.'
);
const foundingProduct = await ensureProduct(
	'arelay_founding',
	'Agent Relay Founding License',
	'One-time founding-user license: Agent Relay Pro features on arelay.app, for life.'
);

const proMonthly = await ensurePrice({
	lookupKey: 'arelay_pro_monthly',
	productId: proProduct.id,
	unitAmount: amounts.proMonthly,
	interval: 'month'
});
const proYearly = await ensurePrice({
	lookupKey: 'arelay_pro_yearly',
	productId: proProduct.id,
	unitAmount: amounts.proYearly,
	interval: 'year'
});
const founding = await ensurePrice({
	lookupKey: 'arelay_founding',
	productId: foundingProduct.id,
	unitAmount: amounts.founding
});

const webhookUrl = process.env.BILLING_WEBHOOK_URL?.trim();
// Links shown inside the portal, derived from the deployment URL when known.
let siteOrigin = process.env.SITE_URL?.trim() || null;
if (!siteOrigin && webhookUrl) {
	try {
		siteOrigin = new URL(webhookUrl).origin;
	} catch {
		siteOrigin = null;
	}
}
const portalConfigurationId = await ensurePortalConfiguration(siteOrigin);

let webhookSecret = null;
if (webhookUrl) {
	webhookSecret = await ensureWebhookEndpoint(webhookUrl);
} else {
	console.log(
		'\nNo BILLING_WEBHOOK_URL set — skipping webhook endpoint creation.' +
			'\nFor local testing use: stripe listen --forward-to localhost:3000/webhooks/stripe'
	);
}

console.log('\nSet these environment variables on the deployment:\n');
console.log(`STRIPE_SECRET_KEY=<your ${liveMode ? 'live' : 'test'} restricted key>`);
console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly.id}`);
console.log(`STRIPE_PRICE_PRO_YEARLY=${proYearly.id}`);
console.log(`STRIPE_PRICE_FOUNDING=${founding.id}`);
console.log(`STRIPE_PORTAL_CONFIGURATION=${portalConfigurationId}`);
if (webhookSecret) {
	console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
} else {
	console.log('STRIPE_WEBHOOK_SECRET=<signing secret of the /webhooks/stripe endpoint>');
}
console.log('\nOptional: STRIPE_AUTOMATIC_TAX=true (only after adding a tax registration in Stripe),');
console.log('BILLING_FOUNDING_CAP=100 (default).');

if (webhookSecret) {
	// Shown once by Stripe, so it has to be printed — flag it where it appears,
	// which is the moment it is most likely to be pasted somewhere it should not be.
	console.log(
		'\nThe signing secret above is a credential. It cannot move money, but anyone\n' +
			'holding it can forge webhook events this app trusts — including ones that\n' +
			'grant a paid plan. Put it in your deployment config and nowhere else. If it\n' +
			'leaks: Dashboard → Developers → Webhooks → the endpoint → Roll secret.'
	);
}
