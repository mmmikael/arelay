import { checkRateLimit } from '$lib/server/rate-limit-db';
import { isRateLimitEnabled, type RateLimitConfig, type RateLimitResult } from '$lib/server/rate-limit';

export const PUBLIC_AUTH_IP_LIMIT: RateLimitConfig = {
	limit: 30,
	windowMs: 60_000
};

export const EMAIL_VERIFICATION_IP_LIMIT: RateLimitConfig = {
	limit: 10,
	windowMs: 60 * 60_000
};

export const EMAIL_VERIFICATION_PER_EMAIL_COOLDOWN_MS = 60_000;

/** Public auth API routes (passkeys + email verification). */
export function isPublicAuthPath(path: string): boolean {
	return (
		path.startsWith('/api/auth/passkeys/login/') ||
		path.startsWith('/api/auth/passkeys/signup/') ||
		path.startsWith('/api/auth/email-verification/')
	);
}

export async function enforcePublicAuthIpRateLimit(clientIp: string): Promise<RateLimitResult> {
	if (!isRateLimitEnabled()) {
		return { ok: true };
	}
	return checkRateLimit(`auth-ip:${clientIp}`, PUBLIC_AUTH_IP_LIMIT);
}

export async function enforceEmailVerificationIpRateLimit(clientIp: string): Promise<RateLimitResult> {
	if (!isRateLimitEnabled()) {
		return { ok: true };
	}
	return checkRateLimit(`email-ip:${clientIp}`, EMAIL_VERIFICATION_IP_LIMIT);
}
