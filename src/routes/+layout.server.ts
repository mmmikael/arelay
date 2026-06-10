import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const scriptUrl = env.UMAMI_SCRIPT_URL?.trim();
	const websiteId = env.UMAMI_WEBSITE_ID?.trim();

	return {
		requestId: locals.requestId,
		umami:
			scriptUrl && websiteId
				? { scriptUrl, websiteId }
				: null
	};
};
