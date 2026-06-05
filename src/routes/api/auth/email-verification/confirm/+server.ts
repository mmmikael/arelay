import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	generateSignupVerificationToken,
	hashSignupVerificationToken,
	hashVerificationCode,
	normalizeEmail,
	normalizeVerificationCode
} from '$lib/server/email-verification';
import { verifyEmailVerificationCode } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		email?: unknown;
		code?: unknown;
	};
	const email = normalizeEmail(body.email);
	const code = normalizeVerificationCode(body.code);
	if (!email || !code) {
		return json({ error: 'Enter the 6-digit verification code.' }, { status: 400 });
	}

	const signupVerificationToken = generateSignupVerificationToken();
	const challenge = await verifyEmailVerificationCode({
		email,
		codeHash: hashVerificationCode(email, code),
		signupTokenHash: hashSignupVerificationToken(signupVerificationToken)
	});
	if (!challenge) {
		return json({ error: 'The verification code is invalid or expired.' }, { status: 400 });
	}

	return json({
		ok: true,
		email: challenge.email,
		displayName: challenge.display_name,
		signupVerificationToken
	});
};
