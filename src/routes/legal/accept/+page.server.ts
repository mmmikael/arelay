import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { hasCurrentLegalVersions } from '$lib/legal';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.authenticated || !locals.user) {
		redirect(303, '/');
	}
	if (hasCurrentLegalVersions(locals.user)) {
		redirect(303, '/portal');
	}
	return {
		email: locals.user.email
	};
};
