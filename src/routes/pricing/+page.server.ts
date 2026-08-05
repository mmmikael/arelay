import type { Logger } from 'pino';
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

/**
 * Look up one price for display. Failures are not fatal — the page falls back to
 * hard-coded amounts — but they are logged loudly, because the fallback amounts are
 * identical to the real ones, so a misconfigured price id is invisible on the page.
 * The same bad id makes checkout fail for a real customer.
 */
async function fetchPriceDisplay(
	secretKey: string,
	priceId: string,
	plan: string,
	log: Logger
): Promise<PriceDisplay | null> {
	try {
		const price = await getStripePrice(secretKey, priceId);
		if (typeof price.unit_amount !== 'number') {
			log.warn(
				{ plan, priceId },
				'stripe price has no unit_amount; /pricing will show fallback amounts'
			);
			return null;
		}
		return { amountCents: price.unit_amount, currency: price.currency };
	} catch (err) {
		log.warn(
			{ err, plan, priceId },
			'stripe price lookup failed; /pricing will show fallback amounts and checkout for this plan will fail'
		);
		return null;
	}
}

async function loadPrices(log: Logger): Promise<PricingPrices> {
	if (cachedPrices && Date.now() - cachedPrices.at < PRICE_CACHE_MS) {
		return cachedPrices.value;
	}
	const secretKey = stripeSecretKey();
	const priceIds = billingPriceIds();
	if (!secretKey || !priceIds) {
		return { proMonthly: null, proYearly: null, founding: null };
	}
	const [proMonthly, proYearly, founding] = await Promise.all([
		fetchPriceDisplay(secretKey, priceIds.proMonthly, 'pro_monthly', log),
		fetchPriceDisplay(secretKey, priceIds.proYearly, 'pro_yearly', log),
		fetchPriceDisplay(secretKey, priceIds.founding, 'founding', log)
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
	const [prices, sold] = await Promise.all([loadPrices(locals.log), countFoundingAccounts()]);
	return {
		billingEnabled,
		authenticated: locals.authenticated,
		prices,
		foundingRemaining: Math.max(0, cap - sold),
		foundingCap: cap
	};
};
