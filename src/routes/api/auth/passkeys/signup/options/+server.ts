import { json } from '@sveltejs/kit';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import {
	getEmailVerificationBySignupToken,
	getUserByEmail,
	listCredentialsForUser
} from '$lib/server/db';
import {
	hashSignupVerificationToken,
	normalizeEmail
} from '$lib/server/email-verification';
import {
	PRIVACY_VERSION,
	TERMS_VERSION,
	isCurrentLegalAcceptance
} from '$lib/legal';
import { routeJsonError } from '$lib/server/api-error';
import {
	challengeExpiresAt,
	getWebAuthnSettings,
	setRegisterChallenge
} from '$lib/server/webauthn';

export const POST: RequestHandler = async ({ locals, cookies, request, url }) => {
	const body = (await request.json().catch(() => ({}))) as {
		email?: unknown;
		displayName?: unknown;
		emailVerificationToken?: unknown;
		termsAccepted?: unknown;
		termsVersion?: unknown;
		privacyVersion?: unknown;
	};
	const email = normalizeEmail(body.email);
	if (!email) {
		return routeJsonError(locals, 400, 'Enter a valid email address.');
	}
	if (typeof body.emailVerificationToken !== 'string' || !body.emailVerificationToken) {
		return routeJsonError(locals, 403, 'Verify your email before creating a passkey.');
	}
	if (!isCurrentLegalAcceptance(body)) {
		return json(
			{ error: 'Accept the current Terms of Service and acknowledge the Privacy Policy.' },
			{ status: 400 }
		);
	}

	const emailVerification = await getEmailVerificationBySignupToken({
		email,
		signupTokenHash: hashSignupVerificationToken(body.emailVerificationToken)
	});
	if (!emailVerification) {
		return routeJsonError(locals, 403, 'Email verification expired. Send a new code.');
	}

	const existingUser = await getUserByEmail(email);
	if (existingUser) {
		const credentials = await listCredentialsForUser(existingUser.id);
		if (credentials.length > 0) {
			return routeJsonError(locals, 403, 'Email verification expired. Send a new code.');
		}
	}

	const userId = existingUser?.id ?? randomUUID();
	const displayName =
		(typeof body.displayName === 'string' && body.displayName.trim()) ||
		emailVerification.display_name ||
		null;
	const credentials = existingUser ? await listCredentialsForUser(existingUser.id) : [];
	const { rpName, rpID } = getWebAuthnSettings(url);
	const options = await generateRegistrationOptions({
		rpName,
		rpID,
		userName: email,
		userID: new TextEncoder().encode(userId),
		userDisplayName: displayName || email,
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
		userId,
		purpose: 'signup',
		email,
		displayName,
		emailVerificationChallengeId: emailVerification.id,
		termsVersion: TERMS_VERSION,
		privacyVersion: PRIVACY_VERSION,
		expiresAt: challengeExpiresAt()
	});

	return json(options);
};
