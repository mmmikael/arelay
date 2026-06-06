import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getE2eeConfig } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals }) => {
	const config = await getE2eeConfig(locals.agentUser!.id);
	if (!config) {
		return json(
			{
				configured: false,
				publicKeyJwk: null,
				error: 'e2ee_required',
				message: 'End-to-end encryption must be configured in the portal before agent delivery.'
			},
			{ status: 428 }
		);
	}

	return json({
		configured: true,
		publicKeyJwk: config.public_key_jwk
	});
};
