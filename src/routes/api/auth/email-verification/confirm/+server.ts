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
import { routeJsonError } from '$lib/server/api-error';

export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json().catch(() => ({}))) as {
		email?: unknown;
		code?: unknown;
	};
	const email = normalizeEmail(body.email);
	const code = normalizeVerificationCode(body.code);
	if (!email || !code) {
		return routeJsonError(locals, 400, 'Enter the 6-digit verification code.');
	}

	const signupVerificationToken = generateSignupVerificationToken();
	const challenge = await verifyEmailVerificationCode({
		email,
		codeHash: hashVerificationCode(email, code),
		signupTokenHash: hashSignupVerificationToken(signupVerificationToken)
	});
	if (!challenge) {
		return routeJsonError(locals, 400, 'The verification code is invalid or expired.');
	}

	return json({
		ok: true,
		email: challenge.email,
		displayName: challenge.display_name,
		signupVerificationToken
	});
};
