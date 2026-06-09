import { json } from '@sveltejs/kit';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import type { RequestHandler } from './$types';
import {
	getE2eeConfig,
	getUserByEmail,
	getWebAuthnCredential,
	listPasskeysForUser
} from '$lib/server/db';
import { parsePasskeyEncryptedPrivateKey } from '$lib/server/e2ee-passkey-config';
import {
	challengeExpiresAt,
	getWebAuthnSettings,
	setLoginChallenge
} from '$lib/server/webauthn';
import { DETERMINISTIC_PRF_SALT_B64URL } from '$lib/e2ee-passkey-salt';

type LoginOptionsBody = {
	email?: string;
	loginCredentialId?: string;
};

export const POST: RequestHandler = async ({ cookies, request, url }) => {
	const body = (await request.json().catch(() => ({}))) as LoginOptionsBody;
	const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
	const loginCredentialId =
		typeof body.loginCredentialId === 'string' ? body.loginCredentialId.trim() : '';

	let userId: string | null = null;
	let allowCredentials:
		| Array<{
				id: string;
				type: 'public-key';
				transports?: AuthenticatorTransport[];
		  }>
		| undefined;
	let legacyPrfSalt: string | null = null;

	if (loginCredentialId) {
		const credential = await getWebAuthnCredential(loginCredentialId);
		userId = credential?.user_id ?? null;
	}
	if (email) {
		const user = await getUserByEmail(email);
		userId ??= user?.id ?? null;
	}

	if (userId) {
		const passkeys = await listPasskeysForUser(userId);
		if (passkeys.length > 0) {
			allowCredentials = passkeys.map((passkey) => ({
				id: passkey.id,
				type: 'public-key' as const,
				transports: passkey.transports as AuthenticatorTransport[] | undefined
			}));
		}
	}

	if (userId) {
		const encryptedPrivateKey = parsePasskeyEncryptedPrivateKey(
			(await getE2eeConfig(userId))?.passkey_encrypted_private_key
		);
		if (encryptedPrivateKey && encryptedPrivateKey.salt !== DETERMINISTIC_PRF_SALT_B64URL) {
			legacyPrfSalt = encryptedPrivateKey.salt;
		}
	}

	const { rpID } = getWebAuthnSettings(url);
	const options = await generateAuthenticationOptions({
		rpID,
		userVerification: 'required',
		timeout: 60_000,
		allowCredentials
	});

	setLoginChallenge(cookies, {
		challenge: options.challenge,
		expiresAt: challengeExpiresAt()
	});

	return json({
		...options,
		extensions: {
			...options.extensions,
			prf: {
				eval: {
					first: DETERMINISTIC_PRF_SALT_B64URL,
					...(legacyPrfSalt ? { second: legacyPrfSalt } : {})
				}
			}
		}
	});
};
