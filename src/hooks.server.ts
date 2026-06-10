import type { Handle, HandleServerError } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { ResolveOptions } from '@sveltejs/kit';
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
import { routeRateLimitResponse } from '$lib/server/api-error';
import { enforceHealthReadyIpRateLimit } from '$lib/server/health-rate-limit';
import {
	finishResponse,
	hookJsonError,
	publicErrorMessage,
	secureRedirect,
	type RequestContext
} from '$lib/server/http-response';
import { createRequestLogger, rootLogger } from '$lib/server/logger';
import { resolveRequestId } from '$lib/server/request-id';
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

function rateLimitResponse(ctx: RequestContext, retryAfterSeconds: number): Response {
	return finishResponse(routeRateLimitResponse(ctx, retryAfterSeconds), ctx);
}

async function handleHealthRequest(
	ctx: RequestContext,
	event: Parameters<Handle>[0]['event'],
	resolve: (event: Parameters<Handle>[0]['event'], opts?: ResolveOptions) => Response | Promise<Response>
): Promise<Response> {
	if (event.url.pathname === '/health/ready') {
		const readyLimit = enforceHealthReadyIpRateLimit(getRequestClientIp(event));
		if (!readyLimit.ok) {
			return rateLimitResponse(ctx, readyLimit.retryAfterSeconds);
		}
	}

	const startedAt = Date.now();
	const response = await resolve(event);
	return finishResponse(response, ctx, {
		startedAt,
		logMessage: 'health check',
		logLevel: 'debug'
	});
}

async function rejectFailedAgentAuth(ctx: RequestContext, clientIp: string): Promise<Response> {
	const failedAuthLimit = await recordFailedAgentAuthIpRateLimit(clientIp);
	if (!failedAuthLimit.ok) {
		return rateLimitResponse(ctx, failedAuthLimit.retryAfterSeconds);
	}
	return hookJsonError(ctx, 401, 'Unauthorized');
}

export const handle: Handle = async ({ event, resolve }) => {
	const secure =
		event.url.protocol === 'https:' ||
		event.request.headers.get('x-forwarded-proto') === 'https';
	const path = event.url.pathname;
	const requestId = resolveRequestId(event.request);
	const log = createRequestLogger(requestId, {
		method: event.request.method,
		path
	});
	const ctx: RequestContext = { requestId, isHttps: secure, log };

	event.locals.requestId = requestId;
	event.locals.log = log;
	event.locals.agentUser = null;
	event.locals.currentPasskeyId = null;
	event.locals.authenticated = false;
	event.locals.user = null;

	if (path === '/health' || path === '/health/ready') {
		return handleHealthRequest(ctx, event, resolve);
	}

	try {
		await ensureSchema();
	} catch (err) {
		const internal =
			err instanceof Error
				? err.message
				: 'Database migrations have not been applied. Run npm run db:migrate.';
		log.error({ err }, 'database init failed');
		return hookJsonError(ctx, 503, publicErrorMessage(internal));
	}

	if (isPublicAuthPath(path)) {
		const authLimit = await enforcePublicAuthIpRateLimit(getRequestClientIp(event));
		if (!authLimit.ok) {
			return rateLimitResponse(ctx, authLimit.retryAfterSeconds);
		}
	}

	if (path.startsWith('/api/agent/')) {
		const clientIp = getRequestClientIp(event);
		const bearerToken = readBearerToken(event.request);

		const exhausted = await peekFailedAgentAuthIpRateLimit(clientIp);
		if (!exhausted.ok) {
			return rateLimitResponse(ctx, exhausted.retryAfterSeconds);
		}

		if (!bearerToken) {
			return rejectFailedAgentAuth(ctx, clientIp);
		}

		const agentUser = await resolveAgentUser(event.request);
		if (!agentUser) {
			return rejectFailedAgentAuth(ctx, clientIp);
		}
		event.locals.agentUser = agentUser;
		const startedAt = Date.now();
		const response = await resolve(event);
		return finishResponse(response, ctx, { startedAt });
	}

	const cookieValue = event.cookies.get(getSessionCookieName());
	const session = verifySession(cookieValue);
	if (session.authenticated && session.userId) {
		const user = await getUser(session.userId);
		if (user) {
			event.locals.authenticated = true;
			event.locals.user = user;
			event.locals.currentPasskeyId = session.credentialId;
		}
	}

	if (event.locals.authenticated && path === '/') {
		return secureRedirect(ctx, '/portal');
	}

	const needsLegalAcceptance =
		event.locals.user !== null && !hasCurrentLegalVersions(event.locals.user);
	if (
		event.locals.authenticated &&
		needsLegalAcceptance &&
		path.startsWith('/portal')
	) {
		return secureRedirect(ctx, '/legal/accept');
	}
	if (
		event.locals.authenticated &&
		!needsLegalAcceptance &&
		path === '/legal/accept'
	) {
		return secureRedirect(ctx, '/portal');
	}

	const isHumanApi =
		path.startsWith('/api/') && !path.startsWith('/api/agent/') && !isPublicAuthPath(path);
	if (path.startsWith('/portal') || isHumanApi) {
		if (!event.locals.authenticated) {
			if (isHumanApi) {
				return hookJsonError(ctx, 401, 'Unauthorized');
			}
			return secureRedirect(ctx, '/');
		}
		if (
			isHumanApi &&
			needsLegalAcceptance &&
			path !== '/api/logout' &&
			path !== '/api/legal/accept'
		) {
			return hookJsonError(ctx, 428, 'Legal acceptance required.');
		}
	}

	const startedAt = Date.now();
	const response = await resolve(event, {
		transformPageChunk: ({ html, done }) => (dev && done ? stripDevPwaMarkup(html) : html)
	});

	if (dev) {
		response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
		response.headers.set('Pragma', 'no-cache');
		sanitizeDevCsp(response);
	}

	return finishResponse(response, ctx, { startedAt });
};

export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const log = event.locals.log ?? rootLogger;
	log.error(
		{
			err: error,
			status,
			path: event.url.pathname,
			method: event.request.method,
			requestId: event.locals.requestId
		},
		'unhandled error'
	);

	const clientMessage = dev ? message : 'Internal Server Error';
	return {
		message: clientMessage,
		requestId: event.locals.requestId
	};
};
