import { buildRobotsTxt, siteOriginFromRequest } from '$lib/seo';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const siteOrigin = siteOriginFromRequest(url.origin, env.ORIGIN);
	const body = buildRobotsTxt(siteOrigin);

	return new Response(body, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
