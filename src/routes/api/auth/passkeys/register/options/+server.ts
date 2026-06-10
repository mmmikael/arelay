import { json } from '@sveltejs/kit';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import { listCredentialsForUser } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';
import {
	challengeExpiresAt,
	getWebAuthnSettings,
	setRegisterChallenge
} from '$lib/server/webauthn';

export const POST: RequestHandler = async ({ cookies, locals, url }) => {
	if (!locals.user) {
		return routeJsonError(locals, 401, 'Sign in before adding a passkey.');
	}

	const user = locals.user;

	const credentials = await listCredentialsForUser(user.id);
	if (credentials.length > 0) {
		return routeJsonError(locals, 409, 'This account already has a passkey.');
	}
	const { rpName, rpID } = getWebAuthnSettings(url);
	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userName: user.email,
		userID: new TextEncoder().encode(user.id),
		userDisplayName: user.display_name || user.email,
		attestationType: 'none',
		excludeCredentials: credentials.map((credential) => ({
			id: credential.id,
			transports: credential.transports as AuthenticatorTransportFuture[]
		})),
		authenticatorSelection: {
			residentKey: 'required',
			userVerification: 'required'
		},
		timeout: 60_000
	});

	setRegisterChallenge(cookies, {
		challenge: options.challenge,
		userId: user.id,
		purpose: 'add-passkey',
		expiresAt: challengeExpiresAt()
	});

	return json(options);
};
