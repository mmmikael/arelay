import type { LayoutServerLoad } from './$types';
import { isEmailReviewRelayEnabled, isSpendReviewRelayEnabled } from '$lib/plugins';
import {
	decryptStripeSecretKey,
	getUserStripeCredentials,
	isStripeTestKey,
	isUserStripeConfigured,
	listSpendRequestSummariesForUser
} from '$plugins/spend-review-relay/server';
import {
	getAccountStorageUsedBytes,
	getE2eeConfig,
	getInboxSessionStats,
	listAgentApiTokensForUser,
	listPasskeysForUser,
	listSessions
} from '$lib/server/db';
import {
	decryptCloudflareAccountId,
	getEmailDraftStats,
	getUserCloudflareEmail,
	isUserCloudflareEmailConfigured,
	listEmailDraftSummariesForUser,
	type EmailDraftStatus
} from '$plugins/email-review-relay/server';
import { inboxVersionFromStats } from '$lib/inbox-version';
import { isPlanId, planLimits } from '$lib/billing/plans';
import { isBillingEnabled } from '$lib/server/billing/config';
import { getBillingAccount } from '$lib/server/billing/db';

type EmailDraftSummaryMap = Record<
	string,
	{ status: EmailDraftStatus; encryption_version: string; updated_at: Date }
>;
const EMPTY_EMAIL_DRAFT_SUMMARIES: EmailDraftSummaryMap = {};
const EMPTY_DRAFT_STATS = { draftCount: 0, latestUpdatedAt: null };

export const load: LayoutServerLoad = async ({ depends, locals }) => {
	depends('inbox:sessions');
	depends('account:passkeys');
	depends('account:agent-tokens');
	depends('account:storage');
	depends('account:e2ee');
	if (isEmailReviewRelayEnabled()) {
		depends('account:cloudflare-email');
	}
	if (isSpendReviewRelayEnabled()) {
		depends('account:stripe-credentials');
	}
	if (isBillingEnabled()) {
		depends('account:billing');
	}
	const userId = locals.user!.id;
	const emailReviewRelayEnabled = isEmailReviewRelayEnabled();
	const spendReviewRelayEnabled = isSpendReviewRelayEnabled();
	const billingEnabled = isBillingEnabled();
	const needsE2eeFetch = locals.e2eeConfigured === undefined;
	const [
		sessions,
		passkeys,
		agentTokens,
		usedBytes,
		sessionStats,
		emailDraftSummaries,
		draftStats,
		cloudflareEmail,
		e2ee,
		billingAccount
	] = await Promise.all([
		listSessions(userId),
		listPasskeysForUser(userId),
		listAgentApiTokensForUser(userId),
		getAccountStorageUsedBytes(userId),
		getInboxSessionStats(userId),
		emailReviewRelayEnabled
			? listEmailDraftSummariesForUser(userId)
			: Promise.resolve(EMPTY_EMAIL_DRAFT_SUMMARIES),
		emailReviewRelayEnabled ? getEmailDraftStats(userId) : Promise.resolve(EMPTY_DRAFT_STATS),
		emailReviewRelayEnabled ? getUserCloudflareEmail(userId) : Promise.resolve(null),
		needsE2eeFetch ? getE2eeConfig(userId) : Promise.resolve(null),
		billingEnabled ? getBillingAccount(userId) : Promise.resolve(null)
	]);
	const plan =
		billingEnabled && billingAccount && isPlanId(billingAccount.plan)
			? billingAccount.plan
			: 'free';
	const storageLimits = planLimits(plan);

	const spendRequestSummaries = spendReviewRelayEnabled
		? await listSpendRequestSummariesForUser(userId)
		: {};
	const stripeCredentials = spendReviewRelayEnabled
		? await getUserStripeCredentials(userId)
		: null;
	const stripeSecretKey =
		stripeCredentials && isUserStripeConfigured(stripeCredentials)
			? decryptStripeSecretKey(stripeCredentials)
			: null;

	// The E2EE setup redirect lives in hooks.server.ts: reading url.pathname
	// here would make this load depend on the URL, refetching the entire
	// layout payload on every session switch.
	const e2eeConfigured = locals.e2eeConfigured ?? Boolean(e2ee);

	return {
		sessions,
		// Baseline for the client poll against /api/inbox/version.
		inboxVersion: inboxVersionFromStats(sessionStats, usedBytes, draftStats),
		emailDraftSummaries,
		spendRequestSummaries,
		e2eeConfigured,
		plugins: {
			emailReviewRelay: emailReviewRelayEnabled,
			spendReviewRelay: spendReviewRelayEnabled
		},
		cloudflareEmail: {
			configured: isUserCloudflareEmailConfigured(cloudflareEmail),
			accountId: cloudflareEmail ? decryptCloudflareAccountId(cloudflareEmail) : null
		},
		stripeCredentials: {
			configured: Boolean(stripeSecretKey),
			testMode: stripeSecretKey ? isStripeTestKey(stripeSecretKey) : false
		},
		storage: {
			usedBytes,
			limitBytes: storageLimits.maxAccountStorageBytes,
			artifactLimitBytes: storageLimits.maxArtifactBytes
		},
		billing: {
			enabled: billingEnabled,
			plan,
			subscriptionStatus: billingAccount?.subscription_status ?? null,
			hasStripeCustomer: Boolean(billingAccount?.stripe_customer_id)
		},
		currentUser: locals.user
			? {
					id: locals.user.id,
					email: locals.user.email,
					displayName: locals.user.display_name
				}
			: null,
		agentTokens: agentTokens.map((token) => ({
			id: token.id,
			name: token.name,
			encryptedToken: token.encrypted_token,
			createdAt: token.created_at,
			lastUsedAt: token.last_used_at
		})),
		passkeys: passkeys.map((passkey) => ({
			id: passkey.id,
			transports: passkey.transports,
			deviceType: passkey.device_type,
			backedUp: passkey.backed_up,
			createdAt: passkey.created_at,
			lastUsedAt: passkey.last_used_at,
			isCurrent: passkey.id === locals.currentPasskeyId
		}))
	};
};
