import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Liveness probe — process is up; no dependency checks. */
export const GET: RequestHandler = async () => {
	return json({
		status: 'ok',
		uptime: process.uptime()
	});
};
