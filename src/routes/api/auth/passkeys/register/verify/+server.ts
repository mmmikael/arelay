import { json } from '@sveltejs/kit';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import { createWebAuthnCredential, getUser } from '$lib/server/db';
import { consumeRegisterChallenge, getWebAuthnSettings } from '$lib/server/webauthn';
import { routeJsonError } from '$lib/server/api-error';

export const POST: RequestHandler = async ({ cookies, locals, request, url }) => {
	if (!locals.user) {
		return routeJsonError(locals, 401, 'Sign in before adding a passkey.');
	}

	const challenge = consumeRegisterChallenge(cookies);
	if (!challenge) {
		return routeJsonError(locals, 400, 'Passkey challenge expired. Try again.');
	}
	if (challenge.userId !== locals.user.id) {
		return routeJsonError(locals, 403, 'Passkey challenge does not match this account.');
	}

	const user = await getUser(challenge.userId);
	if (!user) {
		return routeJsonError(locals, 404, 'User not found.');
	}

	const response = (await request.json()) as RegistrationResponseJSON;
	const { origin, rpID } = getWebAuthnSettings(url);
	const verification = await verifyRegistrationResponse({
		response,
		expectedChallenge: challenge.challenge,
		expectedOrigin: origin,
		expectedRPID: rpID,
		requireUserVerification: true
	});

	if (!verification.verified) {
		return routeJsonError(locals, 401, 'Passkey registration failed.');
	}

	const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
	await createWebAuthnCredential({
		id: credential.id,
		userId: user.id,
		publicKey: credential.publicKey,
		counter: credential.counter,
		transports: response.response.transports ?? [],
		deviceType: credentialDeviceType,
		backedUp: credentialBackedUp
	});

	return json({
		ok: true,
		user: {
			id: user.id,
			email: user.email,
			displayName: user.display_name
		}
	});
};
