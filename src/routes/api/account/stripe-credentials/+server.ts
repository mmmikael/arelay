import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SPEND_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { encryptSecret } from '$lib/server/secret-crypto';
import { routeJsonError } from '$lib/server/api-error';
import {
	decryptStripeSecretKey,
	deleteUserStripeCredentials,
	getUserStripeCredentials,
	isStripeTestKey,
	isUserStripeConfigured,
	upsertUserStripeCredentials,
	validateStripeSecretKey
} from '$plugins/spend-review-relay/server';

function describe(record: Awaited<ReturnType<typeof getUserStripeCredentials>>) {
	if (!isUserStripeConfigured(record)) {
		return { configured: false, testMode: false };
	}
	const secretKey = decryptStripeSecretKey(record);
	return {
		configured: true,
		testMode: secretKey ? isStripeTestKey(secretKey) : false
	};
}

export const GET: RequestHandler = async ({ locals }) => {
	requirePlugin(SPEND_REVIEW_RELAY_PLUGIN_ID);
	const record = await getUserStripeCredentials(locals.user!.id);
	return json(describe(record));
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	requirePlugin(SPEND_REVIEW_RELAY_PLUGIN_ID);

	let body: { secretKey?: string };
	try {
		body = await request.json();
	} catch {
		return routeJsonError(locals, 400, 'Invalid JSON body');
	}

	const secretKey = body.secretKey?.trim();
	if (!secretKey) {
		return routeJsonError(locals, 400, 'secretKey is required');
	}

	try {
		await validateStripeSecretKey(secretKey);
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Could not validate Stripe key' },
			{ status: 400 }
		);
	}

	const record = await upsertUserStripeCredentials({
		userId: locals.user!.id,
		secretKeyCiphertext: encryptSecret(secretKey)
	});

	return json(describe(record));
};

export const DELETE: RequestHandler = async ({ locals }) => {
	requirePlugin(SPEND_REVIEW_RELAY_PLUGIN_ID);
	await deleteUserStripeCredentials(locals.user!.id);
	return json({ configured: false, testMode: false });
};
