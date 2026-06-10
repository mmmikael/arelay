import { dev } from '$app/environment';
import { jsonError, type ApiErrorBody } from '$lib/server/api-error';
import type { NumericRange } from '@sveltejs/kit';
import type { Logger } from 'pino';

export const PUBLIC_SERVICE_UNAVAILABLE = 'Service unavailable.';

export type RequestContext = {
	requestId: string;
	isHttps: boolean;
	log: Logger;
};

const SECURITY_HEADERS = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin',
	'Permissions-Policy':
		'camera=(), geolocation=(), microphone=(), payment=(), publickey-credentials-create=(self), publickey-credentials-get=(self), usb=()',
	'Referrer-Policy': 'no-referrer',
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY'
} as const;

export function publicErrorMessage(internal: string): string {
	return dev ? internal : PUBLIC_SERVICE_UNAVAILABLE;
}

export function applySecurityHeaders(response: Response, ctx: RequestContext): Response {
	response.headers.set('x-request-id', ctx.requestId);
	for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(name, value);
	}
	if (ctx.isHttps) {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains'
		);
	}
	return response;
}

export function finishResponse(
	response: Response,
	ctx: RequestContext,
	options?: {
		startedAt?: number;
		logMessage?: string;
		logLevel?: 'info' | 'debug';
	}
): Response {
	const logMessage = options?.logMessage ?? 'request completed';
	const logLevel = options?.logLevel ?? 'info';
	const fields =
		options?.startedAt !== undefined
			? { status: response.status, durationMs: Date.now() - options.startedAt }
			: { status: response.status };
	ctx.log[logLevel](fields, logMessage);
	return applySecurityHeaders(response, ctx);
}

export function hookJsonError(
	ctx: RequestContext,
	status: NumericRange<400, 599>,
	error: string,
	options?: Omit<ApiErrorBody, 'error' | 'requestId'>
): Response {
	return finishResponse(jsonError(status, error, { requestId: ctx.requestId, ...options }), ctx);
}

export function secureRedirect(ctx: RequestContext, location: string): Response {
	return finishResponse(
		new Response(null, {
			status: 307,
			headers: { Location: location }
		}),
		ctx,
		{ logMessage: 'request redirected' }
	);
}
