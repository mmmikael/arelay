import { json } from '@sveltejs/kit';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, WebAuthnCredential } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import {
	getE2eeConfig,
	getUser,
	getWebAuthnCredential,
	updateWebAuthnCredentialCounter
} from '$lib/server/db';
import { parsePasskeyEncryptedPrivateKey } from '$lib/server/e2ee-passkey-config';
import { createSession, getSessionCookieName, getSessionMaxAge } from '$lib/server/session';
import { consumeLoginChallenge, getWebAuthnSettings } from '$lib/server/webauthn';
import { routeJsonError } from '$lib/server/api-error';

function toSimpleWebAuthnCredential(row: Awaited<ReturnType<typeof getWebAuthnCredential>>): WebAuthnCredential {
	if (!row) throw new Error('Credential not found');
	return {
		id: row.id,
		publicKey: new Uint8Array(row.public_key),
		counter: Number(row.counter),
		transports: row.transports as WebAuthnCredential['transports']
	};
}

export const POST: RequestHandler = async ({ locals, cookies, request, url }) => {
	const challenge = consumeLoginChallenge(cookies);
	if (!challenge) {
		return routeJsonError(locals, 400, 'Passkey challenge expired. Try again.');
	}

	const response = (await request.json()) as AuthenticationResponseJSON;
	const credential = await getWebAuthnCredential(response.id);
	if (!credential) {
		return routeJsonError(locals, 404, 'Passkey is not registered for this relay.');
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
		return routeJsonError(locals, 401, 'Passkey verification failed.');
	}

	const user = await getUser(credential.user_id);
	if (!user) {
		return routeJsonError(locals, 404, 'Passkey user no longer exists.');
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

	const encryptedPrivateKey = parsePasskeyEncryptedPrivateKey(
		(await getE2eeConfig(user.id))?.passkey_encrypted_private_key
	);
	const passkeyEncryptedPrivateKey =
		encryptedPrivateKey && encryptedPrivateKey.credentialId === response.id
			? encryptedPrivateKey
			: null;

	return json({
		ok: true,
		user: {
			id: user.id,
			email: user.email,
			displayName: user.display_name
		},
		passkeyEncryptedPrivateKey
	});
};
