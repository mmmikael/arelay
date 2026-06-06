import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recordLegalAcceptance } from '$lib/server/db';
import {
	PRIVACY_VERSION,
	TERMS_VERSION,
	hasCurrentLegalVersions
} from '$lib/legal';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.authenticated || !locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
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
		return json({ error: 'Could not record acceptance' }, { status: 500 });
	}

	return json({ ok: true });
};
