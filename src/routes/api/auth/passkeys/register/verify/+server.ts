import { json } from '@sveltejs/kit';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import { createWebAuthnCredential, getUser } from '$lib/server/db';
import { consumeRegisterChallenge, getWebAuthnSettings } from '$lib/server/webauthn';

export const POST: RequestHandler = async ({ cookies, locals, request, url }) => {
	if (!locals.user) {
		return json({ error: 'Sign in before adding a passkey.' }, { status: 401 });
	}

	const challenge = consumeRegisterChallenge(cookies);
	if (!challenge) {
		return json({ error: 'Passkey challenge expired. Try again.' }, { status: 400 });
	}
	if (challenge.userId !== locals.user.id) {
		return json({ error: 'Passkey challenge does not match this account.' }, { status: 403 });
	}

	const user = await getUser(challenge.userId);
	if (!user) {
		return json({ error: 'User not found.' }, { status: 404 });
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
		return json({ error: 'Passkey registration failed.' }, { status: 401 });
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
