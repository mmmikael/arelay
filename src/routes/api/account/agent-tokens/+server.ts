import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createAgentApiToken,
	listAgentApiTokensForUser,
	type AgentApiToken,
	type JsonObject
} from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';
import {
	isE2eePolicyResponse,
	isEncryptedEnvelope,
	requireOwnerE2eeForAgent
} from '$lib/server/e2ee-policy';

const TOKEN_HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_TOKEN_NAME_LENGTH = 80;

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanTokenName(value: unknown): string {
	if (typeof value !== 'string') return 'Agent token';
	const trimmed = value.trim();
	if (!trimmed) return 'Agent token';
	return trimmed.slice(0, MAX_TOKEN_NAME_LENGTH);
}

function serializeAgentToken(token: AgentApiToken) {
	return {
		id: token.id,
		name: token.name,
		encryptedToken: token.encrypted_token,
		createdAt: token.created_at,
		lastUsedAt: token.last_used_at
	};
}

function isUniqueViolation(err: unknown): boolean {
	return typeof err === 'object' && err !== null && 'code' in err && err.code === '23505';
}

export const GET: RequestHandler = async ({ locals }) => {
	const tokens = await listAgentApiTokensForUser(locals.user!.id);
	return json({
		tokens: tokens.map(serializeAgentToken)
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const policy = await requireOwnerE2eeForAgent(locals.user!.id);
	if (isE2eePolicyResponse(policy)) {
		return policy;
	}

	const body = (await request.json()) as {
		name?: unknown;
		tokenHash?: unknown;
		encryptedToken?: unknown;
	};
	const tokenHash = typeof body.tokenHash === 'string' ? body.tokenHash.trim().toLowerCase() : '';
	if (!TOKEN_HASH_PATTERN.test(tokenHash)) {
		return routeJsonError(locals, 400, 'A valid token hash is required');
	}

	if (!isEncryptedEnvelope(body.encryptedToken)) {
		return json(
			{ error: 'encryptedToken envelope is required when creating agent tokens' },
			{ status: 400 }
		);
	}

	try {
		const token = await createAgentApiToken({
			userId: locals.user!.id,
			name: cleanTokenName(body.name),
			tokenHash,
			encryptedToken: body.encryptedToken
		});
		return json({ token: serializeAgentToken(token) }, { status: 201 });
	} catch (err) {
		if (isUniqueViolation(err)) {
			return routeJsonError(locals, 409, 'That token already exists');
		}
		throw err;
	}
};
