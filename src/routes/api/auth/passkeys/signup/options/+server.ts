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
import {
	challengeExpiresAt,
	getWebAuthnSettings,
	setRegisterChallenge
} from '$lib/server/webauthn';

export const POST: RequestHandler = async ({ cookies, request, url }) => {
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
		return json({ error: 'Enter a valid email address.' }, { status: 400 });
	}
	if (typeof body.emailVerificationToken !== 'string' || !body.emailVerificationToken) {
		return json({ error: 'Verify your email before creating a passkey.' }, { status: 403 });
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
		return json({ error: 'Email verification expired. Send a new code.' }, { status: 403 });
	}

	const existingUser = await getUserByEmail(email);
	if (existingUser) {
		const credentials = await listCredentialsForUser(existingUser.id);
		if (credentials.length > 0) {
			return json({ error: 'That account already has a passkey. Sign in instead.' }, { status: 409 });
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
