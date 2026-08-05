import { env } from '$env/dynamic/private';
import { isTruthyEnv } from '$lib/plugin-registry';

export const STRIPE_API_BASE = 'https://api.stripe.com';
export const STRIPE_API_VERSION = '2026-06-24.dahlia';

/** Fixed label so hosted checkout sessions are comparable in the Stripe Dashboard. */
export const CHECKOUT_INTEGRATION_IDENTIFIER = 'arelay_billing_pvkqwzmt';

export const DEFAULT_FOUNDING_CAP = 100;

export type BillingPriceIds = {
	proMonthly: string;
	proYearly: string;
	founding: string;
};

export function stripeSecretKey(): string | null {
	const key = env.STRIPE_SECRET_KEY?.trim();
	return key ? key : null;
}

export function stripeWebhookSecret(): string | null {
	const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
	return secret ? secret : null;
}

export function billingPriceIds(): BillingPriceIds | null {
	const proMonthly = env.STRIPE_PRICE_PRO_MONTHLY?.trim();
	const proYearly = env.STRIPE_PRICE_PRO_YEARLY?.trim();
	const founding = env.STRIPE_PRICE_FOUNDING?.trim();
	if (!proMonthly || !proYearly || !founding) return null;
	return { proMonthly, proYearly, founding };
}

/**
 * Billing is a hosted-deployment feature, off unless fully configured.
 * Self-hosts without these env vars run entirely on the free plan.
 */
export function isBillingEnabled(): boolean {
	return Boolean(stripeSecretKey() && stripeWebhookSecret() && billingPriceIds());
}

/**
 * Stripe Tax on checkout. Off by default: enabling it without an active tax
 * registration in Stripe silently collects no tax. Flip on after registering.
 */
export function stripeAutomaticTaxEnabled(): boolean {
	return isTruthyEnv(env.STRIPE_AUTOMATIC_TAX);
}

/** How many founding (lifetime) licenses may be sold. */
export function foundingCap(): number {
	const raw = Number(env.BILLING_FOUNDING_CAP?.trim());
	return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_FOUNDING_CAP;
}
