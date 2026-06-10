import {
	DEFAULT_SITE_DESCRIPTION,
	DEFAULT_SITE_TITLE,
	OG_IMAGE_HEIGHT,
	OG_IMAGE_PATH,
	OG_IMAGE_WIDTH,
	publicCanonicalUrl,
	siteOriginFromRequest
} from '$lib/seo';
import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const scriptUrl = env.UMAMI_SCRIPT_URL?.trim();
	const websiteId = env.UMAMI_WEBSITE_ID?.trim();
	const siteOrigin = siteOriginFromRequest(url.origin, env.ORIGIN);

	return {
		requestId: locals.requestId,
		umami:
			scriptUrl && websiteId
				? { scriptUrl, websiteId }
				: null,
		seo: {
			title: DEFAULT_SITE_TITLE,
			description: DEFAULT_SITE_DESCRIPTION,
			canonicalUrl: publicCanonicalUrl(siteOrigin, url.pathname),
			imageUrl: `${siteOrigin}${OG_IMAGE_PATH}`,
			imageWidth: OG_IMAGE_WIDTH,
			imageHeight: OG_IMAGE_HEIGHT
		}
	};
};
