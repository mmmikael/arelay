import type { RequestHandler } from './$types';
import { getSessionCookieName } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
	cookies.delete(getSessionCookieName(), { path: '/' });
	return new Response(null, { status: 204 });
};
