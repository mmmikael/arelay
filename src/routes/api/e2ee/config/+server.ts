import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getE2eeConfig, listCredentialsForUser, upsertE2eeConfig, type JsonObject } from '$lib/server/db';
import { routeJsonError } from '$lib/server/api-error';
import { parsePasskeyEncryptedPrivateKey } from '$lib/server/e2ee-passkey-config';
import {
	e2eeConfigOverwriteRequired,
	validateEncryptedPrivateKey,
	validateE2eePublicKeyJwk,
	validatePasskeyEncryptedPrivateKeyInput
} from '$lib/server/e2ee-config-validation';

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
		confirmOverwrite?: boolean;
	};

	if (!body.publicKeyJwk || !body.encryptedPrivateKey) {
		return routeJsonError(locals, 400, 'publicKeyJwk and encryptedPrivateKey are required');
	}

	if (!validateE2eePublicKeyJwk(body.publicKeyJwk)) {
		return routeJsonError(locals, 400, 'Invalid publicKeyJwk (P-256 EC key required).');
	}

	if (!validateEncryptedPrivateKey(body.encryptedPrivateKey)) {
		return routeJsonError(
			locals,
			400,
			'Invalid encryptedPrivateKey (PBKDF2-SHA256-A256GCM envelope required).'
		);
	}

	if (
		body.passkeyEncryptedPrivateKey !== undefined &&
		body.passkeyEncryptedPrivateKey !== null &&
		!validatePasskeyEncryptedPrivateKeyInput(body.passkeyEncryptedPrivateKey)
	) {
		return routeJsonError(locals, 400, 'Invalid passkeyEncryptedPrivateKey envelope.');
	}

	const passkeyCredentialId =
		typeof body.passkeyCredentialId === 'string' && body.passkeyCredentialId.trim()
			? body.passkeyCredentialId.trim()
			: null;

	if (body.passkeyEncryptedPrivateKey) {
		if (!passkeyCredentialId) {
			return routeJsonError(
				locals,
				400,
				'passkeyCredentialId is required when passkeyEncryptedPrivateKey is set.'
			);
		}
		const passkeyEnvelope = parsePasskeyEncryptedPrivateKey(body.passkeyEncryptedPrivateKey);
		if (!passkeyEnvelope || passkeyEnvelope.credentialId !== passkeyCredentialId) {
			return routeJsonError(
				locals,
				400,
				'passkeyEncryptedPrivateKey.credentialId must match passkeyCredentialId.'
			);
		}
	}

	if (passkeyCredentialId) {
		const credentials = await listCredentialsForUser(locals.user!.id);
		if (!credentials.some((credential) => credential.id === passkeyCredentialId)) {
			return routeJsonError(locals, 400, 'passkeyCredentialId does not belong to this account.');
		}
	}

	const existing = await getE2eeConfig(locals.user!.id);
	if (
		existing &&
		e2eeConfigOverwriteRequired(existing, {
			publicKeyJwk: body.publicKeyJwk,
			encryptedPrivateKey: body.encryptedPrivateKey,
			passkeyCredentialId
		}) &&
		body.confirmOverwrite !== true
	) {
		return routeJsonError(
			locals,
			409,
			'Encryption is already configured. Set confirmOverwrite to replace keys.'
		);
	}

	const config = await upsertE2eeConfig(locals.user!.id, {
		publicKeyJwk: body.publicKeyJwk,
		encryptedPrivateKey: body.encryptedPrivateKey,
		passkeyCredentialId,
		passkeyEncryptedPrivateKey: body.passkeyEncryptedPrivateKey ?? null,
		recoveryHint:
			typeof body.recoveryHint === 'string' ? body.recoveryHint.trim() || null : null
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
