import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
	enforcePublicAuthIpRateLimit,
	isPublicAuthPath
} from '$lib/server/auth-rate-limit';
import { readBearerToken, resolveAgentUser } from '$lib/server/agent-auth';
import {
	peekFailedAgentAuthIpRateLimit,
	recordFailedAgentAuthIpRateLimit
} from '$lib/server/agent-rate-limit';
import { ensureSchema, getUser } from '$lib/server/db';
import { hasCurrentLegalVersions } from '$lib/legal';
import { buildRateLimitResponse } from '$lib/server/rate-limit';
import { getRequestClientIp } from '$lib/server/request-client-ip';
import { getSessionCookieName, verifySession } from '$lib/server/session';

function stripDevPwaMarkup(html: string): string {
	return html
		.replace(/<link rel="manifest"[^>]*>\s*/g, '')
		.replace(
			/<meta name="apple-mobile-web-app-capable" content="yes"\s*\/?>/g,
			'<meta name="apple-mobile-web-app-capable" content="no" />'
		);
}

function sanitizeDevCsp(response: Response): void {
	const csp = response.headers.get('content-security-policy');
	if (!csp) return;

	const next = csp
		.replace(/;\s*upgrade-insecure-requests\b/g, '')
		.replace(/\bupgrade-insecure-requests;\s*/g, '')
		.replace(/\bupgrade-insecure-requests\b/g, '')
		.trim();

	if (next !== csp) {
		response.headers.set('content-security-policy', next);
	}
}

const SECURITY_HEADERS = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin',
	'Permissions-Policy':
		'camera=(), geolocation=(), microphone=(), payment=(), publickey-credentials-create=(self), publickey-credentials-get=(self), usb=()',
	'Referrer-Policy': 'no-referrer',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY'
} as const;

function applySecurityHeaders(response: Response, isHttps: boolean): Response {
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}
	if (isHttps) {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains'
		);
	}
	return response;
}

function secureRedirect(location: string, isHttps: boolean): Response {
	return applySecurityHeaders(
		new Response(null, {
			status: 307,
			headers: { Location: location }
		}),
		isHttps
	);
}

function databaseUnavailableResponse(secure: boolean, message: string): Response {
	return applySecurityHeaders(
		new Response(JSON.stringify({ error: message }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		}),
		secure
	);
}

function unauthorizedJsonResponse(secure: boolean): Response {
	return applySecurityHeaders(
		new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		}),
		secure
	);
}

async function rejectFailedAgentAuth(clientIp: string, secure: boolean): Promise<Response> {
	const failedAuthLimit = await recordFailedAgentAuthIpRateLimit(clientIp);
	if (!failedAuthLimit.ok) {
		return applySecurityHeaders(
			buildRateLimitResponse(failedAuthLimit.retryAfterSeconds),
			secure
		);
	}
	return unauthorizedJsonResponse(secure);
}

export const handle: Handle = async ({ event, resolve }) => {
	const secure = event.url.protocol === 'https:' || event.request.headers.get('x-forwarded-proto') === 'https';

	try {
		await ensureSchema();
	} catch (err) {
		const message =
			err instanceof Error ? err.message : 'Database migrations have not been applied. Run npm run db:migrate.';
		console.error('[hooks] database init failed:', err);
		return databaseUnavailableResponse(secure, message);
	}

	const path = event.url.pathname;
	event.locals.agentUser = null;
	event.locals.currentPasskeyId = null;

	if (isPublicAuthPath(path)) {
		const authLimit = await enforcePublicAuthIpRateLimit(getRequestClientIp(event));
		if (!authLimit.ok) {
			return applySecurityHeaders(buildRateLimitResponse(authLimit.retryAfterSeconds), secure);
		}
	}

	if (path.startsWith('/api/agent/')) {
		const clientIp = getRequestClientIp(event);
		const bearerToken = readBearerToken(event.request);

		const exhausted = await peekFailedAgentAuthIpRateLimit(clientIp);
		if (!exhausted.ok) {
			return applySecurityHeaders(buildRateLimitResponse(exhausted.retryAfterSeconds), secure);
		}

		if (!bearerToken) {
			return rejectFailedAgentAuth(clientIp, secure);
		}

		const agentUser = await resolveAgentUser(event.request);
		if (!agentUser) {
			return rejectFailedAgentAuth(clientIp, secure);
		}
		event.locals.agentUser = agentUser;
		return applySecurityHeaders(await resolve(event), secure);
	}

	const cookieValue = event.cookies.get(getSessionCookieName());
	const session = verifySession(cookieValue);
	event.locals.authenticated = false;
	event.locals.user = null;
	if (session.authenticated && session.userId) {
		const user = await getUser(session.userId);
		if (user) {
			event.locals.authenticated = true;
			event.locals.user = user;
			event.locals.currentPasskeyId = session.credentialId;
		}
	}

	if (event.locals.authenticated && path === '/') {
		return secureRedirect('/portal', secure);
	}

	const needsLegalAcceptance =
		event.locals.user !== null && !hasCurrentLegalVersions(event.locals.user);
	if (
		event.locals.authenticated &&
		needsLegalAcceptance &&
		path.startsWith('/portal')
	) {
		return secureRedirect('/legal/accept', secure);
	}
	if (
		event.locals.authenticated &&
		!needsLegalAcceptance &&
		path === '/legal/accept'
	) {
		return secureRedirect('/portal', secure);
	}

	const isHumanApi =
		path.startsWith('/api/') && !path.startsWith('/api/agent/') && !isPublicAuthPath(path);
	if (path.startsWith('/portal') || isHumanApi) {
		if (!event.locals.authenticated) {
			if (isHumanApi) {
				return unauthorizedJsonResponse(secure);
			}
			return secureRedirect('/', secure);
		}
		if (
			isHumanApi &&
			needsLegalAcceptance &&
			path !== '/api/logout' &&
			path !== '/api/legal/accept'
		) {
			return applySecurityHeaders(
				new Response(JSON.stringify({ error: 'Legal acceptance required.' }), {
					status: 428,
					headers: { 'Content-Type': 'application/json' }
				}),
				secure
			);
		}
	}

	const response = await resolve(event, {
		transformPageChunk: ({ html, done }) => (dev && done ? stripDevPwaMarkup(html) : html)
	});

	if (dev) {
		response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
		response.headers.set('Pragma', 'no-cache');
		sanitizeDevCsp(response);
	}

	return applySecurityHeaders(response, secure);
};
