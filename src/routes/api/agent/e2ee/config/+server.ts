import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getE2eeConfig } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals }) => {
	const config = await getE2eeConfig(locals.agentUser!.id);
	if (!config) {
		return json({ configured: false, publicKeyJwk: null }, { status: 404 });
	}

	return json({
		configured: true,
		publicKeyJwk: config.public_key_jwk
	});
};
