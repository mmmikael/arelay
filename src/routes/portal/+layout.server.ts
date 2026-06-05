import type { LayoutServerLoad } from './$types';
import { listAgentApiTokensForUser, listPasskeysForUser, listSessions } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ depends, locals }) => {
	depends('inbox:sessions');
	depends('account:passkeys');
	depends('account:agent-tokens');
	const [sessions, passkeys, agentTokens] = await Promise.all([
		listSessions(locals.user!.id),
		listPasskeysForUser(locals.user!.id),
		listAgentApiTokensForUser(locals.user!.id)
	]);
	return {
		sessions,
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
