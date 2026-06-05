import { json } from '@sveltejs/kit';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, WebAuthnCredential } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import { getUser, getWebAuthnCredential, updateWebAuthnCredentialCounter } from '$lib/server/db';
import { createSession, getSessionCookieName, getSessionMaxAge } from '$lib/server/session';
import { consumeLoginChallenge, getWebAuthnSettings } from '$lib/server/webauthn';

function toSimpleWebAuthnCredential(row: Awaited<ReturnType<typeof getWebAuthnCredential>>): WebAuthnCredential {
	if (!row) throw new Error('Credential not found');
	return {
		id: row.id,
		publicKey: new Uint8Array(row.public_key),
		counter: Number(row.counter),
		transports: row.transports as WebAuthnCredential['transports']
	};
}

export const POST: RequestHandler = async ({ cookies, request, url }) => {
	const challenge = consumeLoginChallenge(cookies);
	if (!challenge) {
		return json({ error: 'Passkey challenge expired. Try again.' }, { status: 400 });
	}

	const response = (await request.json()) as AuthenticationResponseJSON;
	const credential = await getWebAuthnCredential(response.id);
	if (!credential) {
		return json({ error: 'Passkey is not registered for this relay.' }, { status: 404 });
	}

	const { origin, rpID } = getWebAuthnSettings(url);
	const verification = await verifyAuthenticationResponse({
		response,
		expectedChallenge: challenge.challenge,
		expectedOrigin: origin,
		expectedRPID: rpID,
		credential: toSimpleWebAuthnCredential(credential),
		requireUserVerification: true
	});

	if (!verification.verified) {
		return json({ error: 'Passkey verification failed.' }, { status: 401 });
	}

	const user = await getUser(credential.user_id);
	if (!user) {
		return json({ error: 'Passkey user no longer exists.' }, { status: 404 });
	}

	await updateWebAuthnCredentialCounter(
		credential.id,
		verification.authenticationInfo.newCounter
	);

	const { cookieValue } = createSession(user.id, credential.id);
	cookies.set(getSessionCookieName(), cookieValue, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: getSessionMaxAge(),
		secure: process.env.NODE_ENV === 'production'
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
