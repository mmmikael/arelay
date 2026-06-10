import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordLegalAcceptance } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';
import {
	PRIVACY_VERSION,
	TERMS_VERSION,
	hasCurrentLegalVersions
} from '$lib/legal';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.authenticated || !locals.user) {
		return routeJsonError(locals, 401, 'Unauthorized');
	}

	if (hasCurrentLegalVersions(locals.user)) {
		return json({ ok: true, alreadyAccepted: true });
	}

	const user = await recordLegalAcceptance({
		userId: locals.user.id,
		termsVersion: TERMS_VERSION,
		privacyVersion: PRIVACY_VERSION
	});

	if (!user) {
		return routeJsonError(locals, 500, 'Could not record acceptance');
	}

	return json({ ok: true });
};
