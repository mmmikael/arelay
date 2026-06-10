import { json } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import type { RequestHandler } from './$types';
import { routeLogAndJsonError, routeRateLimitResponse } from '$lib/server/api-error';
import {
	EMAIL_VERIFICATION_PER_EMAIL_COOLDOWN_MS,
	enforceEmailVerificationIpRateLimit
} from '$lib/server/auth-rate-limit';
import {
	createEmailVerificationChallenge,
	deleteEmailVerificationChallenge,
	getRecentEmailVerificationCreatedAt,
	getUserByEmail,
	listCredentialsForUser
} from '$lib/server/db';
import {
	EMAIL_VERIFICATION_MAX_AGE_MS,
	generateVerificationCode,
	hashVerificationCode,
	normalizeEmail,
	sendVerificationEmail
} from '$lib/server/email-verification';
import { getRequestClientIp } from '$lib/server/request-client-ip';

function verificationStartedResponse() {
	return {
		ok: true as const,
		expiresInSeconds: Math.floor(EMAIL_VERIFICATION_MAX_AGE_MS / 1000),
		delivery: 'email' as const
	};
}

function unguessableCodeHash(email: string): string {
	return hashVerificationCode(email, randomBytes(32).toString('base64url'));
}

export const POST: RequestHandler = async ({ locals, request, url, getClientAddress }) => {
	const body = (await request.json().catch(() => ({}))) as {
		email?: unknown;
		displayName?: unknown;
	};
	const email = normalizeEmail(body.email);
	if (!email) {
		return json({ error: 'Enter a valid email address.' }, { status: 400 });
	}

	const recentSendAt = await getRecentEmailVerificationCreatedAt(
		email,
		EMAIL_VERIFICATION_PER_EMAIL_COOLDOWN_MS
	);
	if (recentSendAt) {
		const retryAfterSeconds = Math.max(
			1,
			Math.ceil(
				(recentSendAt.getTime() +
					EMAIL_VERIFICATION_PER_EMAIL_COOLDOWN_MS -
					Date.now()) /
					1000
			)
		);
		return routeRateLimitResponse(
			locals,
			retryAfterSeconds,
			'Wait a minute before requesting another code.'
		);
	}

	const ipLimit = await enforceEmailVerificationIpRateLimit(getRequestClientIp({ getClientAddress }));
	if (!ipLimit.ok) {
		return routeRateLimitResponse(
			locals,
			ipLimit.retryAfterSeconds,
			'Too many verification attempts from this network.'
		);
	}

	const existingUser = await getUserByEmail(email);
	if (existingUser) {
		const credentials = await listCredentialsForUser(existingUser.id);
		if (credentials.length > 0) {
			await createEmailVerificationChallenge({
				email,
				displayName: null,
				codeHash: unguessableCodeHash(email),
				expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_MAX_AGE_MS)
			});
			return json(verificationStartedResponse());
		}
	}

	const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
	const code = generateVerificationCode();
	const challenge = await createEmailVerificationChallenge({
		email,
		displayName: displayName || null,
		codeHash: hashVerificationCode(email, code),
		expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_MAX_AGE_MS)
	});

	try {
		const delivery = await sendVerificationEmail({
			to: email,
			code,
			origin: url.origin
		});
		return json({
			...verificationStartedResponse(),
			delivery: delivery.channel
		});
	} catch (err) {
		await deleteEmailVerificationChallenge(challenge.id);
		return routeLogAndJsonError(
			locals,
			500,
			'Could not send verification email.',
			err
		);
	}
};
