import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { isEmailReviewRelayEnabled } from '$lib/plugins';
import {
	getAccountStorageUsedBytes,
	getE2eeConfig,
	listAgentApiTokensForUser,
	listPasskeysForUser,
	listSessions
} from '$lib/server/db';
import {
	getUserCloudflareEmail,
	listEmailDraftSummariesForUser,
	type EmailDraftStatus
} from '$plugins/email-review-relay/server';
import { resolvePortalE2eeRedirect } from '$lib/server/portal-gate';
import { MAX_ACCOUNT_STORAGE_BYTES, MAX_ARTIFACT_BYTES } from '$lib/storage-limits';

type EmailDraftSummaryMap = Record<
	string,
	{ status: EmailDraftStatus; encryption_version: string }
>;
const EMPTY_EMAIL_DRAFT_SUMMARIES: EmailDraftSummaryMap = {};

export const load: LayoutServerLoad = async ({ depends, locals, url }) => {
	depends('inbox:sessions');
	depends('account:passkeys');
	depends('account:agent-tokens');
	depends('account:storage');
	depends('account:e2ee');
	if (isEmailReviewRelayEnabled()) {
		depends('account:cloudflare-email');
	}
	const userId = locals.user!.id;
	const emailReviewRelayEnabled = isEmailReviewRelayEnabled();
	const [sessions, passkeys, agentTokens, usedBytes, emailDraftSummaries, cloudflareEmail, e2ee] =
		await Promise.all([
			listSessions(userId),
			listPasskeysForUser(userId),
			listAgentApiTokensForUser(userId),
			getAccountStorageUsedBytes(userId),
			emailReviewRelayEnabled
				? listEmailDraftSummariesForUser(userId)
				: Promise.resolve(EMPTY_EMAIL_DRAFT_SUMMARIES),
			emailReviewRelayEnabled
				? getUserCloudflareEmail(userId)
				: Promise.resolve(null),
			getE2eeConfig(userId)
		]);

	const e2eeConfigured = Boolean(e2ee);
	const pathname = url.pathname;

	const portalRedirect = resolvePortalE2eeRedirect(pathname, e2eeConfigured);
	if (portalRedirect) {
		redirect(303, portalRedirect);
	}

	return {
		sessions,
		emailDraftSummaries,
		e2eeConfigured,
		plugins: {
			emailReviewRelay: emailReviewRelayEnabled
		},
		cloudflareEmail: {
			configured: Boolean(cloudflareEmail),
			accountId: cloudflareEmail?.account_id ?? null
		},
		storage: {
			usedBytes,
			limitBytes: MAX_ACCOUNT_STORAGE_BYTES,
			artifactLimitBytes: MAX_ARTIFACT_BYTES
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
