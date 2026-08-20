import { env } from '$env/dynamic/private';
import { decryptStripeSecretKey, isUserStripeConfigured } from './credentials';
import { getUserStripeCredentials } from './db';
import type { SpendRequestChargeFields, SpendRequestRecord, StripeChargeResult } from './types';

// Stripe's always-succeeds test payment method. Off-session confirmation with this
// produces a real test-mode charge without a stored customer or card, which is exactly
// what a spend-approval demo needs.
const STRIPE_TEST_PAYMENT_METHOD = 'pm_card_visa';
const STRIPE_PAYMENT_INTENTS_URL = 'https://api.stripe.com/v1/payment_intents';
const STRIPE_BALANCE_URL = 'https://api.stripe.com/v1/balance';

// Agentic Commerce Protocol (Stripe + OpenAI). On approval we mint a Shared Payment Token
// scoped to the merchant, the human-approved amount, and a short expiry — the SPT *is* the
// governance artifact. Requires ACP access + a seller network business profile.
const STRIPE_ACP_TOKENS_URL = 'https://api.stripe.com/v1/shared_payment/issued_tokens';
const STRIPE_ACP_API_VERSION = '2026-04-22.preview';
const ACP_SPT_EXPIRY_SECONDS = 15 * 60;

type SpendStripeMode = 'payment_intent' | 'acp_spt';

/** Which Stripe rail an approval executes on. Defaults to PaymentIntent. */
export function spendStripeMode(): SpendStripeMode {
	const raw = env.SPEND_STRIPE_MODE?.trim().toLowerCase();
	return raw === 'acp_spt' || raw === 'acp' || raw === 'spt' ? 'acp_spt' : 'payment_intent';
}

/** Confirm a Stripe secret key works before saving it. Throws a user-facing message on failure. */
export async function validateStripeSecretKey(secretKey: string): Promise<void> {
	const key = secretKey.trim();
	if (!/^(sk|rk)_(test|live)_/.test(key)) {
		throw new Error('Enter a Stripe secret key (starts with sk_test_, sk_live_, or rk_…).');
	}
	const response = await fetch(STRIPE_BALANCE_URL, {
		headers: { Authorization: `Bearer ${key}` }
	});
	if (response.ok) return;

	const rawBody = await response.text();
	let result: { error?: { message?: string } } | null = null;
	try {
		result = rawBody ? JSON.parse(rawBody) : null;
	} catch {
		result = null;
	}
	if (response.status === 401) {
		throw new Error('Stripe rejected this secret key. Check that you copied it correctly.');
	}
	throw new Error(result?.error?.message || `Could not validate Stripe key (${response.status}).`);
}

type StripeResponse = {
	id?: string;
	status?: string;
	amount?: number;
	currency?: string;
	last_payment_error?: { message?: string };
	error?: { message?: string };
};

function parseStripeBody(rawBody: string): StripeResponse | null {
	try {
		return rawBody ? (JSON.parse(rawBody) as StripeResponse) : null;
	} catch {
		return null;
	}
}

type ChargeContext = {
	secretKey: string;
	request: SpendRequestRecord;
	fields: SpendRequestChargeFields;
	origin: string;
};

/**
 * Create and confirm a Stripe PaymentIntent for an approved spend request. The per-user
 * Stripe secret key is read server-side and never logged.
 */
async function createPaymentIntentCharge(ctx: ChargeContext): Promise<StripeChargeResult> {
	const params = new URLSearchParams();
	params.set('amount', String(ctx.fields.amount_minor));
	params.set('currency', ctx.fields.currency);
	params.set('payment_method', STRIPE_TEST_PAYMENT_METHOD);
	params.set('confirm', 'true');
	params.set('off_session', 'true');
	params.set('description', ctx.fields.description);
	params.set('metadata[payee]', ctx.fields.payee);
	params.set('metadata[agent_relay_request_id]', ctx.request.id);
	params.set('metadata[agent_relay_origin]', ctx.origin);

	const response = await fetch(STRIPE_PAYMENT_INTENTS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${ctx.secretKey}`,
			'Content-Type': 'application/x-www-form-urlencoded',
			// Stops a retried approval from charging twice.
			'Idempotency-Key': `arelay_spend_${ctx.request.id}`
		},
		body: params.toString()
	});

	const rawBody = await response.text();
	const result = parseStripeBody(rawBody);

	if (!response.ok) {
		// Never log the secret key; the raw Stripe body is safe and makes failures diagnosable.
		console.error(
			`[spend-send] Stripe charge failed: status=${response.status} body=${rawBody.slice(0, 2000)}`
		);
		throw new Error(result?.error?.message || `Stripe charge failed (${response.status})`);
	}

	const status = typeof result?.status === 'string' ? result.status : 'unknown';
	// succeeded: captured. requires_capture: authorized (manual capture). processing: async.
	if (status !== 'succeeded' && status !== 'requires_capture' && status !== 'processing') {
		throw new Error(
			result?.last_payment_error?.message || `Payment was not completed (status: ${status})`
		);
	}

	return {
		kind: 'payment_intent',
		payment_intent_id: String(result?.id ?? ''),
		status,
		amount_minor: Number(result?.amount ?? ctx.fields.amount_minor),
		currency: String(result?.currency ?? ctx.fields.currency)
	};
}

/**
 * Mint an ACP Shared Payment Token scoped to the merchant + the human-approved amount + a
 * short expiry. The token is the human-authorized grant a merchant would redeem to create
 * their own PaymentIntent. Requires SPEND_STRIPE_MODE=acp_spt and a seller profile.
 */
async function mintSharedPaymentToken(ctx: ChargeContext): Promise<StripeChargeResult> {
	const sellerProfile = env.STRIPE_ACP_SELLER_PROFILE?.trim();
	if (!sellerProfile) {
		throw new Error(
			'ACP mode is on but STRIPE_ACP_SELLER_PROFILE (the merchant network business profile) is not set.'
		);
	}
	const paymentMethod = env.STRIPE_ACP_PAYMENT_METHOD?.trim() || STRIPE_TEST_PAYMENT_METHOD;
	const expiresAt = Math.floor(Date.now() / 1000) + ACP_SPT_EXPIRY_SECONDS;

	const params = new URLSearchParams();
	params.set('payment_method', paymentMethod);
	params.set('seller_details[network_business_profile]', sellerProfile);
	params.set('usage_limits[currency]', ctx.fields.currency);
	params.set('usage_limits[max_amount]', String(ctx.fields.amount_minor));
	params.set('usage_limits[expires_at]', String(expiresAt));

	const response = await fetch(STRIPE_ACP_TOKENS_URL, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${ctx.secretKey}`,
			'Content-Type': 'application/x-www-form-urlencoded',
			'Stripe-Version': STRIPE_ACP_API_VERSION,
			'Idempotency-Key': `arelay_spt_${ctx.request.id}`
		},
		body: params.toString()
	});

	const rawBody = await response.text();
	const result = parseStripeBody(rawBody);

	if (!response.ok) {
		console.error(
			`[spend-send] Stripe SPT mint failed: status=${response.status} body=${rawBody.slice(0, 2000)}`
		);
		throw new Error(
			result?.error?.message || `Shared Payment Token mint failed (${response.status})`
		);
	}

	const status = typeof result?.status === 'string' ? result.status : 'active';
	return {
		kind: 'shared_payment_token',
		payment_intent_id: String(result?.id ?? ''),
		status,
		amount_minor: ctx.fields.amount_minor,
		currency: ctx.fields.currency
	};
}

/**
 * Execute an approved spend request on the configured Stripe rail. The reviewer's decrypted
 * fields are passed in; the per-user Stripe secret key is read server-side and never logged.
 * Throws with a reviewer-facing message on failure.
 */
export async function executeApprovedSpendRequest(input: {
	userId: string;
	request: SpendRequestRecord;
	fields: SpendRequestChargeFields;
	origin: string;
}): Promise<StripeChargeResult> {
	const credentials = await getUserStripeCredentials(input.userId);
	if (!isUserStripeConfigured(credentials)) {
		throw new Error(
			'Stripe is not configured for this account. Add your Stripe secret key in Account settings.'
		);
	}
	const secretKey = decryptStripeSecretKey(credentials);
	if (!secretKey) {
		throw new Error(
			'Stripe secret key could not be read. Re-save your secret key in Account settings.'
		);
	}

	const ctx: ChargeContext = {
		secretKey,
		request: input.request,
		fields: input.fields,
		origin: input.origin
	};

	return spendStripeMode() === 'acp_spt'
		? mintSharedPaymentToken(ctx)
		: createPaymentIntentCharge(ctx);
}
