import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createEmailVerificationChallenge, getUserByEmail, listCredentialsForUser } from '$lib/server/db';
import {
	EMAIL_VERIFICATION_MAX_AGE_MS,
	generateVerificationCode,
	hashVerificationCode,
	normalizeEmail,
	sendVerificationEmail
} from '$lib/server/email-verification';

export const POST: RequestHandler = async ({ request, url }) => {
	const body = (await request.json().catch(() => ({}))) as {
		email?: unknown;
		displayName?: unknown;
	};
	const email = normalizeEmail(body.email);
	if (!email) {
		return json({ error: 'Enter a valid email address.' }, { status: 400 });
	}

	const existingUser = await getUserByEmail(email);
	if (existingUser) {
		const credentials = await listCredentialsForUser(existingUser.id);
		if (credentials.length > 0) {
			return json({ error: 'That account already exists. Sign in instead.' }, { status: 409 });
		}
	}

	const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
	const code = generateVerificationCode();
	await createEmailVerificationChallenge({
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
			ok: true,
			expiresInSeconds: Math.floor(EMAIL_VERIFICATION_MAX_AGE_MS / 1000),
			delivery: delivery.channel
		});
	} catch (err) {
		console.error('[email-verification] failed to send code:', err);
		return json({ error: 'Could not send verification email.' }, { status: 500 });
	}
};
