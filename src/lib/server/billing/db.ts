import { ensureSchema, getDb } from '$lib/server/db';
import { isPlanId, type PlanId } from '$lib/billing/plans';
import { isBillingEnabled } from './config';

export type BillingAccount = {
	user_id: string;
	stripe_customer_id: string | null;
	plan: string;
	plan_source: string | null;
	stripe_subscription_id: string | null;
	subscription_status: string | null;
	current_period_end: Date | null;
	created_at: Date;
	updated_at: Date;
};

export async function getBillingAccount(userId: string): Promise<BillingAccount | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<BillingAccount[]>`
		SELECT
			user_id,
			stripe_customer_id,
			plan,
			plan_source,
			stripe_subscription_id,
			subscription_status,
			current_period_end,
			created_at,
			updated_at
		FROM billing_accounts
		WHERE user_id = ${userId}
	`;
	return rows[0] ?? null;
}

export async function getBillingAccountByStripeCustomerId(
	stripeCustomerId: string
): Promise<BillingAccount | null> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<BillingAccount[]>`
		SELECT
			user_id,
			stripe_customer_id,
			plan,
			plan_source,
			stripe_subscription_id,
			subscription_status,
			current_period_end,
			created_at,
			updated_at
		FROM billing_accounts
		WHERE stripe_customer_id = ${stripeCustomerId}
	`;
	return rows[0] ?? null;
}

/**
 * Effective plan for entitlement checks. Free when billing is disabled
 * (self-hosts never touch the billing table) or no paid record exists.
 */
export async function getEffectivePlan(userId: string): Promise<PlanId> {
	if (!isBillingEnabled()) return 'free';
	const account = await getBillingAccount(userId);
	return account && isPlanId(account.plan) ? account.plan : 'free';
}

export async function setStripeCustomerId(
	userId: string,
	stripeCustomerId: string
): Promise<void> {
	await ensureSchema();
	const db = getDb();
	await db`
		INSERT INTO billing_accounts (user_id, stripe_customer_id)
		VALUES (${userId}, ${stripeCustomerId})
		ON CONFLICT (user_id)
		DO UPDATE SET
			stripe_customer_id = COALESCE(billing_accounts.stripe_customer_id, EXCLUDED.stripe_customer_id),
			updated_at = NOW()
	`;
}

export type PlanUpdate = {
	plan: PlanId;
	planSource: 'subscription' | 'lifetime' | null;
	stripeSubscriptionId?: string | null;
	subscriptionStatus?: string | null;
	currentPeriodEnd?: Date | null;
};

/**
 * Apply a webhook-derived plan change. A lifetime (founding) plan is never
 * downgraded by subscription lifecycle events — subscription fields still
 * update so the record reflects Stripe, but the plan stays lifetime.
 */
export async function applyPlanUpdate(
	userId: string,
	stripeCustomerId: string | null,
	update: PlanUpdate
): Promise<void> {
	await ensureSchema();
	const db = getDb();
	await db`
		INSERT INTO billing_accounts (
			user_id,
			stripe_customer_id,
			plan,
			plan_source,
			stripe_subscription_id,
			subscription_status,
			current_period_end
		)
		VALUES (
			${userId},
			${stripeCustomerId},
			${update.plan},
			${update.planSource},
			${update.stripeSubscriptionId ?? null},
			${update.subscriptionStatus ?? null},
			${update.currentPeriodEnd ?? null}
		)
		ON CONFLICT (user_id)
		DO UPDATE SET
			stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, billing_accounts.stripe_customer_id),
			plan = CASE
				WHEN billing_accounts.plan_source = 'lifetime' AND EXCLUDED.plan_source IS DISTINCT FROM 'lifetime'
					THEN billing_accounts.plan
				ELSE EXCLUDED.plan
			END,
			plan_source = CASE
				WHEN billing_accounts.plan_source = 'lifetime' AND EXCLUDED.plan_source IS DISTINCT FROM 'lifetime'
					THEN billing_accounts.plan_source
				ELSE EXCLUDED.plan_source
			END,
			stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, billing_accounts.stripe_subscription_id),
			subscription_status = COALESCE(EXCLUDED.subscription_status, billing_accounts.subscription_status),
			current_period_end = COALESCE(EXCLUDED.current_period_end, billing_accounts.current_period_end),
			updated_at = NOW()
	`;
}

/** How many founding (lifetime) licenses have been sold. */
export async function countFoundingAccounts(): Promise<number> {
	await ensureSchema();
	const db = getDb();
	const rows = await db<Array<{ count: number }>>`
		SELECT COUNT(*)::int AS count
		FROM billing_accounts
		WHERE plan_source = 'lifetime'
	`;
	return rows[0]?.count ?? 0;
}
