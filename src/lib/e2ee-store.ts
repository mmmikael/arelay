import { derived, writable } from 'svelte/store';
import type { EncryptedPrivateKey, PasskeyEncryptedPrivateKey } from '$lib/e2ee';

export type E2eeConfigState = {
	configured: boolean;
	publicKeyJwk: JsonWebKey | null;
	encryptedPrivateKey: EncryptedPrivateKey | null;
	passkeyCredentialId: string | null;
	passkeyEncryptedPrivateKey: PasskeyEncryptedPrivateKey | null;
	recoveryHint: string | null;
};

export const defaultE2eeConfigState: E2eeConfigState = {
	configured: false,
	publicKeyJwk: null,
	encryptedPrivateKey: null,
	passkeyCredentialId: null,
	passkeyEncryptedPrivateKey: null,
	recoveryHint: null
};

export const e2eeConfig = writable<E2eeConfigState>({ ...defaultE2eeConfigState });

export const e2eePrivateKey = writable<CryptoKey | null>(null);

/** Clear in-memory E2EE state on logout so portal auto-unlock does not re-prompt. */
export function resetE2eeClientState(): void {
	e2eeConfig.set({ ...defaultE2eeConfigState });
	e2eePrivateKey.set(null);
}
export const e2eeUnlocked = derived(e2eePrivateKey, ($privateKey) => Boolean($privateKey));
