import type { PageServerLoad } from './$types';
import {
	billingPriceIds,
	foundingCap,
	isBillingEnabled,
	stripeSecretKey
} from '$lib/server/billing/config';
import { countFoundingAccounts } from '$lib/server/billing/db';
import { getStripePrice } from '$lib/server/billing/stripe-api';

export type PriceDisplay = { amountCents: number; currency: string };
export type PricingPrices = {
	proMonthly: PriceDisplay | null;
	proYearly: PriceDisplay | null;
	founding: PriceDisplay | null;
};

const PRICE_CACHE_MS = 10 * 60 * 1000;
let cachedPrices: { at: number; value: PricingPrices } | null = null;

async function fetchPriceDisplay(secretKey: string, priceId: string): Promise<PriceDisplay | null> {
	try {
		const price = await getStripePrice(secretKey, priceId);
		if (typeof price.unit_amount !== 'number') return null;
		return { amountCents: price.unit_amount, currency: price.currency };
	} catch {
		// Pricing display is best-effort; checkout works without it.
		return null;
	}
}

async function loadPrices(): Promise<PricingPrices> {
	if (cachedPrices && Date.now() - cachedPrices.at < PRICE_CACHE_MS) {
		return cachedPrices.value;
	}
	const secretKey = stripeSecretKey();
	const priceIds = billingPriceIds();
	if (!secretKey || !priceIds) {
		return { proMonthly: null, proYearly: null, founding: null };
	}
	const [proMonthly, proYearly, founding] = await Promise.all([
		fetchPriceDisplay(secretKey, priceIds.proMonthly),
		fetchPriceDisplay(secretKey, priceIds.proYearly),
		fetchPriceDisplay(secretKey, priceIds.founding)
	]);
	const value = { proMonthly, proYearly, founding };
	if (proMonthly && proYearly && founding) {
		cachedPrices = { at: Date.now(), value };
	}
	return value;
}

export const load: PageServerLoad = async ({ locals }) => {
	const billingEnabled = isBillingEnabled();
	if (!billingEnabled) {
		return {
			billingEnabled,
			authenticated: locals.authenticated,
			prices: null,
			foundingRemaining: null,
			foundingCap: null
		};
	}
	const cap = foundingCap();
	const [prices, sold] = await Promise.all([loadPrices(), countFoundingAccounts()]);
	return {
		billingEnabled,
		authenticated: locals.authenticated,
		prices,
		foundingRemaining: Math.max(0, cap - sold),
		foundingCap: cap
	};
};
