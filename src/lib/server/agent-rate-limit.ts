import { checkRateLimit, peekRateLimit } from '$lib/server/rate-limit-db';
import {
	isRateLimitEnabled,
	type RateLimitConfig,
	type RateLimitResult
} from '$lib/server/rate-limit';

export const AGENT_SESSION_LIMIT_ERROR = 'Hourly session limit reached. Try again later.';
export const AGENT_ARTIFACT_LIMIT_ERROR =
	'Hourly artifact upload limit reached. Try again later.';

export const FAILED_AGENT_AUTH_IP_LIMIT: RateLimitConfig = {
	limit: 60,
	windowMs: 60_000
};

export const AGENT_SESSION_CREATE_LIMIT: RateLimitConfig = {
	limit: 30,
	windowMs: 60 * 60_000
};

export const AGENT_ARTIFACT_CREATE_LIMIT: RateLimitConfig = {
	limit: 200,
	windowMs: 60 * 60_000
};

export async function peekFailedAgentAuthIpRateLimit(clientIp: string): Promise<RateLimitResult> {
	if (!isRateLimitEnabled()) {
		return { ok: true };
	}
	return peekRateLimit(`agent-401-ip:${clientIp}`, FAILED_AGENT_AUTH_IP_LIMIT);
}

export async function recordFailedAgentAuthIpRateLimit(clientIp: string): Promise<RateLimitResult> {
	if (!isRateLimitEnabled()) {
		return { ok: true };
	}
	return checkRateLimit(`agent-401-ip:${clientIp}`, FAILED_AGENT_AUTH_IP_LIMIT);
}

/** Atomically reserves a session-create slot (Postgres bucket upsert). */
export async function reserveAgentSessionCreate(userId: string): Promise<RateLimitResult> {
	if (!isRateLimitEnabled()) {
		return { ok: true };
	}
	return checkRateLimit(`agent-sessions:${userId}`, AGENT_SESSION_CREATE_LIMIT);
}

/** Atomically reserves an artifact-create slot (Postgres bucket upsert). */
export async function reserveAgentArtifactCreate(userId: string): Promise<RateLimitResult> {
	if (!isRateLimitEnabled()) {
		return { ok: true };
	}
	return checkRateLimit(`agent-artifacts:${userId}`, AGENT_ARTIFACT_CREATE_LIMIT);
}
