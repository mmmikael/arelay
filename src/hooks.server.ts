import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getSessionCookieName, verifySession } from '$lib/server/session';
import { resolveAgentUser } from '$lib/server/agent-auth';
import { ensureSchema, getUser } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
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
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		event.locals.agentUser = agentUser;
		return resolve(event);
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
		throw redirect(307, '/portal');
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
				return new Response(JSON.stringify({ error: 'Unauthorized' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				});
			}
			throw redirect(307, '/');
		}
	}

	return resolve(event);
};
