import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkReadiness } from '$lib/server/health';
import { publicErrorMessage, PUBLIC_SERVICE_UNAVAILABLE } from '$lib/server/http-response';

/** Readiness probe — verifies database connectivity and schema. */
export const GET: RequestHandler = async ({ locals }) => {
	const result = await checkReadiness();
	if (!result.ok) {
		locals.log.warn(
			{ checks: result.checks, err: result.internalError },
			'readiness check failed'
		);
		return json(
			{
				status: 'error',
				checks: result.checks,
				error: publicErrorMessage(result.internalError ?? PUBLIC_SERVICE_UNAVAILABLE),
				requestId: locals.requestId
			},
			{ status: 503 }
		);
	}
	return json({
		status: 'ready',
		checks: result.checks
	});
};
