import {
	usesDeterministicPasskeySalt,
	type EncryptedPrivateKey,
	type PasskeyEncryptedPrivateKey
} from '$lib/e2ee';
import { saveE2eePasskeyHint } from '$lib/e2ee-passkey-hint';
import { e2eeConfig, type E2eeConfigState } from '$lib/e2ee-store';

type E2eeConfigResponse = {
	configured?: boolean;
	publicKeyJwk?: JsonWebKey | null;
	encryptedPrivateKey?: EncryptedPrivateKey | null;
	passkeyCredentialId?: string | null;
	passkeyEncryptedPrivateKey?: PasskeyEncryptedPrivateKey | null;
	recoveryHint?: string | null;
};

function toE2eeConfigState(config: E2eeConfigResponse): E2eeConfigState {
	return {
		configured: Boolean(config.configured),
		publicKeyJwk: config.publicKeyJwk ?? null,
		encryptedPrivateKey: config.encryptedPrivateKey ?? null,
		passkeyCredentialId: config.passkeyCredentialId ?? null,
		passkeyEncryptedPrivateKey: config.passkeyEncryptedPrivateKey ?? null,
		recoveryHint: config.recoveryHint ?? null
	};
}

export async function loadE2eeConfigState(): Promise<E2eeConfigState> {
	const res = await fetch('/api/e2ee/config');
	const config = (await res.json()) as E2eeConfigResponse;
	if (!res.ok) throw new Error('Could not load encryption config');

	const state = toE2eeConfigState(config);
	e2eeConfig.set(state);
	if (state.passkeyEncryptedPrivateKey) {
		saveE2eePasskeyHint(state.passkeyEncryptedPrivateKey);
	}
	return state;
}

export async function persistMigratedPasskeyPrivateKey(
	passkeyEncryptedPrivateKey: PasskeyEncryptedPrivateKey,
	config?: E2eeConfigState
): Promise<E2eeConfigState | null> {
	if (!usesDeterministicPasskeySalt(passkeyEncryptedPrivateKey)) return null;

	const state = config ?? (await loadE2eeConfigState());
	if (!state.publicKeyJwk || !state.encryptedPrivateKey) return null;

	const res = await fetch('/api/e2ee/config', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			publicKeyJwk: state.publicKeyJwk,
			encryptedPrivateKey: state.encryptedPrivateKey,
			passkeyCredentialId: passkeyEncryptedPrivateKey.credentialId,
			passkeyEncryptedPrivateKey,
			recoveryHint: state.recoveryHint
		})
	});
	if (!res.ok) return null;

	const updated = toE2eeConfigState((await res.json()) as E2eeConfigResponse);
	e2eeConfig.set(updated);
	if (updated.passkeyEncryptedPrivateKey) {
		saveE2eePasskeyHint(updated.passkeyEncryptedPrivateKey);
	}
	return updated;
}
