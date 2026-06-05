import {
	getUserByActiveAgentTokenHash,
	hashAgentToken,
	markAgentTokenUsed,
	type User
} from '$lib/server/db';

function readBearerToken(request: Request): string | null {
	const header = request.headers.get('authorization');
	if (!header?.startsWith('Bearer ')) return null;
	const token = header.slice('Bearer '.length).trim();
	return token || null;
}

export async function resolveAgentUser(request: Request): Promise<User | null> {
	const token = readBearerToken(request);
	if (!token) return null;

	const result = await getUserByActiveAgentTokenHash(hashAgentToken(token));
	if (!result) return null;

	void markAgentTokenUsed(result.tokenId).catch((err) => {
		console.error('[agent-auth] failed to update token last_used_at:', err);
	});

	return result.user;
}
