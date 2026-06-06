import type { Handle } from '@sveltejs/kit';
import { getSessionCookieName, verifySession } from '$lib/server/session';
import { resolveAgentUser } from '$lib/server/agent-auth';
import { ensureSchema, getUser } from '$lib/server/db';

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

export const handle: Handle = async ({ event, resolve }) => {
	const secure = event.url.protocol === 'https:' || event.request.headers.get('x-forwarded-proto') === 'https';

	try {
		await ensureSchema();
	} catch (err) {
		console.error('[hooks] database init failed:', err);
	}

	const path = event.url.pathname;
	event.locals.agentUser = null;
	event.locals.currentPasskeyId = null;

	if (path.startsWith('/api/agent/')) {
		const agentUser = await resolveAgentUser(event.request);
		if (!agentUser) {
			return applySecurityHeaders(
				new Response(JSON.stringify({ error: 'Unauthorized' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}),
				secure
			);
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

	const isPublicAuthApi =
		path.startsWith('/api/auth/passkeys/login/') ||
		path.startsWith('/api/auth/passkeys/signup/') ||
		path.startsWith('/api/auth/email-verification/');
	const isHumanApi =
		path.startsWith('/api/') && !path.startsWith('/api/agent/') && !isPublicAuthApi;
	if (path.startsWith('/portal') || isHumanApi) {
		if (!event.locals.authenticated) {
			if (isHumanApi) {
				return applySecurityHeaders(
					new Response(JSON.stringify({ error: 'Unauthorized' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json' }
					}),
					secure
				);
			}
			return secureRedirect('/', secure);
		}
	}

	return applySecurityHeaders(await resolve(event), secure);
};
