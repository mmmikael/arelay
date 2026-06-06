import type { LayoutServerLoad } from './$types';
import { isEmailReviewRelayEnabled } from '$lib/plugins';
import {
	getAccountStorageUsedBytes,
	listAgentApiTokensForUser,
	listPasskeysForUser,
	listSessions
} from '$lib/server/db';
import {
	getUserCloudflareEmail,
	listEmailDraftSummariesForUser,
	type EmailDraftStatus
} from '$plugins/email-review-relay/server';

type EmailDraftSummaryMap = Record<
	string,
	{ status: EmailDraftStatus; encryption_version: string }
>;
const EMPTY_EMAIL_DRAFT_SUMMARIES: EmailDraftSummaryMap = {};
import { MAX_ACCOUNT_STORAGE_BYTES, MAX_ARTIFACT_BYTES } from '$lib/storage-limits';

export const load: LayoutServerLoad = async ({ depends, locals }) => {
	depends('inbox:sessions');
	depends('account:passkeys');
	depends('account:agent-tokens');
	depends('account:storage');
	if (isEmailReviewRelayEnabled()) {
		depends('account:cloudflare-email');
	}
	const userId = locals.user!.id;
	const emailReviewRelayEnabled = isEmailReviewRelayEnabled();
	const [sessions, passkeys, agentTokens, usedBytes, emailDraftSummaries, cloudflareEmail] =
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
				: Promise.resolve(null)
		]);
	return {
		sessions,
		emailDraftSummaries,
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
