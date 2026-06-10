import { json, type NumericRange } from '@sveltejs/kit';
import type { Logger } from 'pino';
import { buildRateLimitResponse } from '$lib/server/rate-limit';

export type ApiErrorBody = {
	error: string;
	requestId?: string;
	retryAfterSeconds?: number;
};

export type RouteErrorLocals = {
	requestId: string;
	log: Logger;
};

export function jsonError(
	status: NumericRange<400, 599>,
	error: string,
	options?: { requestId?: string; retryAfterSeconds?: number }
): Response {
	const body: ApiErrorBody = { error };
	if (options?.requestId) body.requestId = options.requestId;
	if (options?.retryAfterSeconds !== undefined) {
		body.retryAfterSeconds = options.retryAfterSeconds;
	}
	return json(body, { status });
}

/** Route handler JSON error — always includes `requestId` from locals. */
export function routeJsonError(
	locals: Pick<RouteErrorLocals, 'requestId'>,
	status: NumericRange<400, 599>,
	error: string,
	options?: { retryAfterSeconds?: number }
): Response {
	return jsonError(status, error, { requestId: locals.requestId, ...options });
}

export function logAndJsonError(
	log: Logger,
	status: NumericRange<400, 599>,
	error: string,
	cause: unknown,
	options?: { requestId?: string }
): Response {
	log.warn({ err: cause, status }, error);
	return jsonError(status, error, options);
}

/** Route handler error with structured logging — binds `requestId` from locals. */
export function routeLogAndJsonError(
	locals: RouteErrorLocals,
	status: NumericRange<400, 599>,
	error: string,
	cause: unknown
): Response {
	return logAndJsonError(locals.log, status, error, cause, { requestId: locals.requestId });
}

/** Route handler 429 — includes `requestId` in the JSON body. */
export function routeRateLimitResponse(
	locals: Pick<RouteErrorLocals, 'requestId'>,
	retryAfterSeconds: number,
	error?: string
): Response {
	return buildRateLimitResponse(retryAfterSeconds, error, locals.requestId);
}
