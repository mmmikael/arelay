import { env } from '$env/dynamic/private';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	const scriptUrl = env.UMAMI_SCRIPT_URL?.trim();
	const websiteId = env.UMAMI_WEBSITE_ID?.trim();

	return {
		umami:
			scriptUrl && websiteId
				? { scriptUrl, websiteId }
				: null
	};
};
