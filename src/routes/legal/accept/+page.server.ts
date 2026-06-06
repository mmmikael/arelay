import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { recordLegalAcceptance } from '$lib/server/db';
import {
	PRIVACY_VERSION,
	TERMS_VERSION,
	hasCurrentLegalVersions
} from '$lib/legal';

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

export const actions: Actions = {
	default: async ({ locals, request }) => {
		if (!locals.authenticated || !locals.user) {
			redirect(303, '/');
		}
		const form = await request.formData();
		if (form.get('accepted') !== 'yes') {
			return fail(400, { error: 'Accept the terms to continue.' });
		}
		await recordLegalAcceptance({
			userId: locals.user.id,
			termsVersion: TERMS_VERSION,
			privacyVersion: PRIVACY_VERSION
		});
		redirect(303, '/portal');
	}
};
