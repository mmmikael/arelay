import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { env } from '$env/dynamic/private';

const COOKIE_NAME = 'agent_relay_session';
const MAX_AGE = 60 * 60 * 24 * 7;
const SESSION_FORMAT = 'v3';

type SessionPayload = {
	userId: string;
	credentialId: string;
	createdAt: number;
	nonce: string;
};

export type VerifiedSession = {
	authenticated: boolean;
	userId: string | null;
	credentialId: string | null;
};

function getSessionSecret(): string | undefined {
	return env.SESSION_SECRET;
}

function getSessionVersion(): string {
	return env.SESSION_VERSION ?? '1';
}

function sign(value: string): string {
	const secret = getSessionSecret();
	if (!secret) throw new Error('SESSION_SECRET is not set');
	const version = getSessionVersion();
	return createHmac('sha256', secret).update(`${version}:${value}`).digest('hex');
}

function base64UrlEncode(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
	return Buffer.from(value, 'base64url').toString('utf8');
}

export function createSignedValue(payload: unknown): string {
	const encoded = base64UrlEncode(JSON.stringify(payload));
	return `${encoded}.${sign(encoded)}`;
}

export function verifySignedValue<T>(cookieValue: string | undefined): T | null {
	if (!getSessionSecret() || !cookieValue) return null;
	const [encoded, sig] = cookieValue.split('.');
	if (!encoded || !sig) return null;
	const expected = sign(encoded);
	try {
		if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
		return JSON.parse(base64UrlDecode(encoded)) as T;
	} catch {
		return null;
	}
}

export function createSession(userId: string, credentialId: string): { cookieValue: string } {
	const payload: SessionPayload = {
		userId,
		credentialId,
		createdAt: Date.now(),
		nonce: randomBytes(16).toString('hex')
	};
	return { cookieValue: `${SESSION_FORMAT}.${createSignedValue(payload)}` };
}

export function verifySession(cookieValue: string | undefined): VerifiedSession {
	if (!cookieValue?.startsWith(`${SESSION_FORMAT}.`)) {
		return { authenticated: false, userId: null, credentialId: null };
	}
	const payload = verifySignedValue<SessionPayload>(cookieValue.slice(`${SESSION_FORMAT}.`.length));
	if (!payload?.userId || !payload.credentialId || typeof payload.createdAt !== 'number') {
		return { authenticated: false, userId: null, credentialId: null };
	}
	if (Date.now() - payload.createdAt > MAX_AGE * 1000) {
		return { authenticated: false, userId: null, credentialId: null };
	}
	return { authenticated: true, userId: payload.userId, credentialId: payload.credentialId };
}

export function getSessionCookieName(): string {
	return COOKIE_NAME;
}

export function getSessionMaxAge(): number {
	return MAX_AGE;
}
