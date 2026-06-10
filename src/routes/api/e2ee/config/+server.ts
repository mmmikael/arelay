import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getE2eeConfig, upsertE2eeConfig, type JsonObject } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ locals }) => {
	const config = await getE2eeConfig(locals.user!.id);
	return json({
		configured: Boolean(config),
		publicKeyJwk: config?.public_key_jwk ?? null,
		encryptedPrivateKey: config?.encrypted_private_key ?? null,
		passkeyCredentialId: config?.passkey_credential_id ?? null,
		passkeyEncryptedPrivateKey: config?.passkey_encrypted_private_key ?? null,
		recoveryHint: config?.recovery_hint ?? null
	});
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const body = (await request.json()) as {
		publicKeyJwk?: JsonObject;
		encryptedPrivateKey?: JsonObject;
		passkeyCredentialId?: string | null;
		passkeyEncryptedPrivateKey?: JsonObject | null;
		recoveryHint?: string | null;
	};

	if (!body.publicKeyJwk || !body.encryptedPrivateKey) {
		return routeJsonError(locals, 400, 'publicKeyJwk and encryptedPrivateKey are required');
	}

	const config = await upsertE2eeConfig(locals.user!.id, {
		publicKeyJwk: body.publicKeyJwk,
		encryptedPrivateKey: body.encryptedPrivateKey,
		passkeyCredentialId: body.passkeyCredentialId ?? null,
		passkeyEncryptedPrivateKey: body.passkeyEncryptedPrivateKey ?? null,
		recoveryHint: body.recoveryHint ?? null
	});

	return json({
		configured: true,
		publicKeyJwk: config.public_key_jwk,
		encryptedPrivateKey: config.encrypted_private_key,
		passkeyCredentialId: config.passkey_credential_id,
		passkeyEncryptedPrivateKey: config.passkey_encrypted_private_key,
		recoveryHint: config.recovery_hint
	});
};
