import { createHmac, timingSafeEqual } from 'crypto';
import type { PlanUpdate } from './db';

const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Verify a `Stripe-Signature` header against the raw request payload.
 * Scheme: HMAC-SHA256 of `${timestamp}.${payload}` with the endpoint secret,
 * compared against every `v1` entry, with a replay-window tolerance check.
 * https://docs.stripe.com/webhooks#verify-manually
 */
export function verifyStripeWebhookSignature(
	payload: string,
	signatureHeader: string | null,
	secret: string,
	options?: { toleranceSeconds?: number; nowSeconds?: number }
): boolean {
	if (!signatureHeader || !secret) return false;

	let timestamp: string | null = null;
	const signatures: string[] = [];
	for (const part of signatureHeader.split(',')) {
		const [key, value] = part.split('=', 2).map((entry) => entry?.trim());
		if (!key || !value) continue;
		if (key === 't') timestamp = value;
		if (key === 'v1') signatures.push(value);
	}
	if (!timestamp || signatures.length === 0) return false;

	const timestampSeconds = Number(timestamp);
	if (!Number.isFinite(timestampSeconds)) return false;

	const tolerance = options?.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
	const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
	if (Math.abs(now - timestampSeconds) > tolerance) return false;

	const expected = createHmac('sha256', secret)
		.update(`${timestamp}.${payload}`)
		.digest('hex');
	const expectedBuffer = Buffer.from(expected, 'utf8');

	return signatures.some((signature) => {
		const signatureBuffer = Buffer.from(signature, 'utf8');
		return (
			signatureBuffer.length === expectedBuffer.length &&
			timingSafeEqual(signatureBuffer, expectedBuffer)
		);
	});
}

export type StripeEvent = {
	id?: string;
	type?: string;
	data?: { object?: Record<string, unknown> };
};

export function parseStripeEvent(payload: string): StripeEvent | null {
	try {
		const parsed = JSON.parse(payload) as unknown;
		if (!parsed || typeof parsed !== 'object') return null;
		return parsed as StripeEvent;
	} catch {
		return null;
	}
}

export type BillingEventAction = {
	userId: string | null;
	stripeCustomerId: string | null;
	update: PlanUpdate;
};

/** Subscription statuses that keep Pro access (past_due rides out dunning retries). */
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);

function asString(value: unknown): string | null {
	return typeof value === 'string' && value ? value : null;
}

function metadataValue(object: Record<string, unknown>, key: string): string | null {
	const metadata = object.metadata;
	if (!metadata || typeof metadata !== 'object') return null;
	return asString((metadata as Record<string, unknown>)[key]);
}

function subscriptionPeriodEnd(object: Record<string, unknown>): Date | null {
	// Newer API versions expose current_period_end per subscription item.
	const items = object.items;
	let raw: unknown =
		items && typeof items === 'object'
			? (
					(items as { data?: Array<Record<string, unknown>> }).data?.[0] as
						| Record<string, unknown>
						| undefined
				)?.current_period_end
			: undefined;
	raw = raw ?? object.current_period_end;
	const seconds = typeof raw === 'number' ? raw : Number(raw);
	if (!Number.isFinite(seconds) || seconds <= 0) return null;
	return new Date(seconds * 1000);
}

/**
 * Map a verified Stripe event to a plan change, or null for events that
 * require no action. Pure so the mapping is unit-testable; the caller
 * resolves the user and persists the update.
 */
export function planUpdateFromEvent(event: StripeEvent): BillingEventAction | null {
	const type = event.type ?? '';
	const object = event.data?.object;
	if (!object) return null;

	if (type === 'checkout.session.completed') {
		const userId = metadataValue(object, 'arelay_user_id') ?? asString(object.client_reference_id);
		const stripeCustomerId = asString(object.customer);
		const mode = asString(object.mode);
		const plan = metadataValue(object, 'arelay_plan');

		if (mode === 'payment' && plan === 'founding') {
			return {
				userId,
				stripeCustomerId,
				update: { plan: 'founding', planSource: 'lifetime' }
			};
		}
		if (mode === 'subscription') {
			return {
				userId,
				stripeCustomerId,
				update: {
					plan: 'pro',
					planSource: 'subscription',
					stripeSubscriptionId: asString(object.subscription)
				}
			};
		}
		return null;
	}

	if (
		type === 'customer.subscription.created' ||
		type === 'customer.subscription.updated' ||
		type === 'customer.subscription.deleted'
	) {
		const userId = metadataValue(object, 'arelay_user_id');
		const stripeCustomerId = asString(object.customer);
		const subscriptionId = asString(object.id);
		const status = type === 'customer.subscription.deleted' ? 'canceled' : asString(object.status);
		const keepsPro = status !== null && ACTIVE_SUBSCRIPTION_STATUSES.has(status);

		return {
			userId,
			stripeCustomerId,
			update: keepsPro
				? {
						plan: 'pro',
						planSource: 'subscription',
						stripeSubscriptionId: subscriptionId,
						subscriptionStatus: status,
						currentPeriodEnd: subscriptionPeriodEnd(object)
					}
				: {
						plan: 'free',
						planSource: null,
						stripeSubscriptionId: subscriptionId,
						subscriptionStatus: status,
						currentPeriodEnd: subscriptionPeriodEnd(object)
					}
		};
	}

	return null;
}
