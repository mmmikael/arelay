import type { LayoutServerLoad } from './$types';
import {
	getAccountStorageUsedBytes,
	listAgentApiTokensForUser,
	listPasskeysForUser,
	listSessions
} from '$lib/server/db';
import { MAX_ACCOUNT_STORAGE_BYTES, MAX_ARTIFACT_BYTES } from '$lib/storage-limits';

export const load: LayoutServerLoad = async ({ depends, locals }) => {
	depends('inbox:sessions');
	depends('account:passkeys');
	depends('account:agent-tokens');
	depends('account:storage');
	const userId = locals.user!.id;
	const [sessions, passkeys, agentTokens, usedBytes] = await Promise.all([
		listSessions(userId),
		listPasskeysForUser(userId),
		listAgentApiTokensForUser(userId),
		getAccountStorageUsedBytes(userId)
	]);
	return {
		sessions,
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
