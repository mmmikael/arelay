import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createSignedValue, verifySignedValue } from '$lib/server/session';

const REGISTER_CHALLENGE_COOKIE = 'agent_relay_webauthn_register';
const LOGIN_CHALLENGE_COOKIE = 'agent_relay_webauthn_login';
const CHALLENGE_MAX_AGE = 5 * 60;

export type RegisterChallenge = {
	challenge: string;
	userId: string;
	purpose?: 'signup' | 'add-passkey';
	email?: string;
	displayName?: string | null;
	emailVerificationChallengeId?: string;
	termsVersion?: string;
	privacyVersion?: string;
	expiresAt: number;
};

export type LoginChallenge = {
	challenge: string;
	expiresAt: number;
};

function cookieOptions() {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: process.env.NODE_ENV === 'production',
		maxAge: CHALLENGE_MAX_AGE
	};
}

export function getWebAuthnSettings(url: URL): { rpName: string; rpID: string; origin: string } {
	return {
		rpName: env.WEBAUTHN_RP_NAME || 'Agent Relay',
		rpID: env.WEBAUTHN_RP_ID || url.hostname,
		origin: env.WEBAUTHN_ORIGIN || url.origin
	};
}

export function setRegisterChallenge(cookies: Cookies, challenge: RegisterChallenge): void {
	cookies.set(REGISTER_CHALLENGE_COOKIE, createSignedValue(challenge), cookieOptions());
}

export function consumeRegisterChallenge(cookies: Cookies): RegisterChallenge | null {
	const challenge = verifySignedValue<RegisterChallenge>(cookies.get(REGISTER_CHALLENGE_COOKIE));
	cookies.delete(REGISTER_CHALLENGE_COOKIE, { path: '/' });
	if (!challenge || challenge.expiresAt < Date.now()) return null;
	return challenge;
}

export function setLoginChallenge(cookies: Cookies, challenge: LoginChallenge): void {
	cookies.set(LOGIN_CHALLENGE_COOKIE, createSignedValue(challenge), cookieOptions());
}

export function consumeLoginChallenge(cookies: Cookies): LoginChallenge | null {
	const challenge = verifySignedValue<LoginChallenge>(cookies.get(LOGIN_CHALLENGE_COOKIE));
	cookies.delete(LOGIN_CHALLENGE_COOKIE, { path: '/' });
	if (!challenge || challenge.expiresAt < Date.now()) return null;
	return challenge;
}

export function challengeExpiresAt(): number {
	return Date.now() + CHALLENGE_MAX_AGE * 1000;
}
