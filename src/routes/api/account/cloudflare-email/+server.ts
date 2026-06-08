import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID, requirePlugin } from '$lib/plugins';
import { decryptSecret, encryptSecret } from '$lib/server/secret-crypto';
import { validateCloudflareEmailCredentials } from '$lib/server/email-send';
import {
	decryptCloudflareAccountId,
	deleteUserCloudflareEmail,
	getUserCloudflareEmail,
	isUserCloudflareEmailConfigured,
	upsertUserCloudflareEmail
} from '$plugins/email-review-relay/server';

export const GET: RequestHandler = async ({ locals }) => {
	requirePlugin(EMAIL_REVIEW_RELAY_PLUGIN_ID);

	const record = await getUserCloudflareEmail(locals.user!.id);
	return json({
		configured: isUserCloudflareEmailConfigured(record),
		accountId: record ? decryptCloudflareAccountId(record) : null
	});
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	requirePlugin(EMAIL_REVIEW_RELAY_PLUGIN_ID);

	let body: { accountId?: string; apiToken?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const accountId = body.accountId?.trim();
	const apiToken = body.apiToken?.trim();
	if (!accountId || !apiToken) {
		return json({ error: 'accountId and apiToken are required' }, { status: 400 });
	}

	try {
		await validateCloudflareEmailCredentials({ accountId, apiToken });
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Could not validate Cloudflare credentials' },
			{ status: 400 }
		);
	}

	const record = await upsertUserCloudflareEmail({
		userId: locals.user!.id,
		accountIdCiphertext: encryptSecret(accountId),
		apiTokenCiphertext: encryptSecret(apiToken)
	});

	return json({
		configured: true,
		accountId: decryptCloudflareAccountId(record)
	});
};

export const DELETE: RequestHandler = async ({ locals }) => {
	requirePlugin(EMAIL_REVIEW_RELAY_PLUGIN_ID);

	await deleteUserCloudflareEmail(locals.user!.id);
	return json({ configured: false });
};
