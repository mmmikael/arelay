import { json } from '@sveltejs/kit';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import {
	challengeExpiresAt,
	getWebAuthnSettings,
	setLoginChallenge
} from '$lib/server/webauthn';

export const POST: RequestHandler = async ({ cookies, url }) => {
	const { rpID } = getWebAuthnSettings(url);
	const options = await generateAuthenticationOptions({
		rpID,
		userVerification: 'required',
		timeout: 60_000
	});

	setLoginChallenge(cookies, {
		challenge: options.challenge,
		expiresAt: challengeExpiresAt()
	});

	return json(options);
};
