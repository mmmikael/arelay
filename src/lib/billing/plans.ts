/**
 * Plan definitions shared by client and server. Self-hosted deployments run
 * entirely on the free plan unless billing is enabled — limits here must keep
 * the free tier identical to the historical hard-coded limits.
 */

export type PlanId = 'free' | 'pro' | 'founding';

export type PlanLimits = {
	maxArtifactBytes: number;
	maxAccountStorageBytes: number;
};

export const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
	free: {
		maxArtifactBytes: 25 * 1024 * 1024,
		maxAccountStorageBytes: 500 * 1024 * 1024
	},
	pro: {
		maxArtifactBytes: 100 * 1024 * 1024,
		maxAccountStorageBytes: 10 * 1024 * 1024 * 1024
	},
	founding: {
		maxArtifactBytes: 100 * 1024 * 1024,
		maxAccountStorageBytes: 10 * 1024 * 1024 * 1024
	}
};

export const PLAN_LABELS: Record<PlanId, string> = {
	free: 'Free',
	pro: 'Pro',
	founding: 'Founding'
};

/**
 * Shown on /pricing only when the live Stripe price lookup fails, so a transient
 * Stripe outage does not blank out the pricing page.
 *
 * These MUST match the amounts configured in Stripe. They are display-only — checkout
 * always charges the Stripe price — but a stale value here quotes a price you do not
 * charge. Update them in the same change as any reprice.
 */
export const FALLBACK_PRICE_DISPLAY = {
	proMonthly: '$9',
	proYearly: '$79',
	founding: '$149'
} as const;

export function isPlanId(value: unknown): value is PlanId {
	return value === 'free' || value === 'pro' || value === 'founding';
}

/** Resolve limits for a stored plan value; unknown or missing values fall back to free. */
export function planLimits(plan: string | null | undefined): PlanLimits {
	return isPlanId(plan) ? PLAN_LIMITS[plan] : PLAN_LIMITS.free;
}

export function isPaidPlan(plan: string | null | undefined): boolean {
	return plan === 'pro' || plan === 'founding';
}
