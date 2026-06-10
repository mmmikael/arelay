import { buildSitemapXml, siteOriginFromRequest } from '$lib/seo';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const siteOrigin = siteOriginFromRequest(url.origin, env.ORIGIN);
	const body = buildSitemapXml(siteOrigin);

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=3600'
		}
	});
};
