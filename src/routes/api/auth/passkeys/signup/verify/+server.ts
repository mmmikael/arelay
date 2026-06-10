import { json } from '@sveltejs/kit';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import { routeLogAndJsonError } from '$lib/server/api-error';
import {
	consumeEmailVerificationChallenge,
	createUser,
	createWebAuthnCredential,
	getUser,
	getUserByEmail,
	recordLegalAcceptance,
	updateWebAuthnCredentialCounter
} from '$lib/server/db';
import { createSession, getSessionCookieName, getSessionMaxAge } from '$lib/server/session';
import { consumeRegisterChallenge, getWebAuthnSettings } from '$lib/server/webauthn';

export const POST: RequestHandler = async ({ cookies, locals, request, url }) => {
	const challenge = consumeRegisterChallenge(cookies);
	if (!challenge) {
		return json({ error: 'Passkey challenge expired. Try again.' }, { status: 400 });
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

	let user =
		challenge.purpose === 'signup'
			? challenge.email
				? await getUserByEmail(challenge.email)
				: null
			: await getUser(challenge.userId);
	if (challenge.purpose === 'signup') {
		if (
			!challenge.email ||
			!challenge.emailVerificationChallengeId ||
			!challenge.termsVersion ||
			!challenge.privacyVersion
		) {
			return json({ error: 'Email verification expired. Try again.' }, { status: 400 });
		}
		if (user && user.id !== challenge.userId) {
			return json({ error: 'That account was created already. Sign in instead.' }, { status: 409 });
		}
		if (!user) {
			try {
				user = await createUser({
					id: challenge.userId,
					email: challenge.email,
					displayName: challenge.displayName ?? null,
					termsVersion: challenge.termsVersion,
					privacyVersion: challenge.privacyVersion
				});
			} catch (err) {
				return routeLogAndJsonError(
					locals,
					409,
					'Could not create account. Try signing in.',
					err
				);
			}
		} else {
			user =
				(await recordLegalAcceptance({
					userId: user.id,
					termsVersion: challenge.termsVersion,
					privacyVersion: challenge.privacyVersion
				})) ?? user;
		}
	} else if (!user) {
		return json({ error: 'Account setup expired. Try again.' }, { status: 404 });
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
	await updateWebAuthnCredentialCounter(credential.id, credential.counter);
	if (challenge.purpose === 'signup' && challenge.emailVerificationChallengeId) {
		await consumeEmailVerificationChallenge(challenge.emailVerificationChallengeId);
	}

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
