import type { PasskeyEncryptedPrivateKey } from '$lib/e2ee';

const E2EE_PASSKEY_HINT_KEY = 'agentRelay:e2eePasskeyHint';

export type E2eePasskeyHint = {
	credentialId: string;
	salt: string;
};

export function saveE2eePasskeyHint(encryptedPrivateKey: PasskeyEncryptedPrivateKey): void {
	try {
		const hint: E2eePasskeyHint = {
			credentialId: encryptedPrivateKey.credentialId,
			salt: encryptedPrivateKey.salt
		};
		localStorage.setItem(E2EE_PASSKEY_HINT_KEY, JSON.stringify(hint));
	} catch {}
}

export function readE2eePasskeyHint(): E2eePasskeyHint | null {
	try {
		const raw = localStorage.getItem(E2EE_PASSKEY_HINT_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<E2eePasskeyHint>;
		if (
			typeof parsed.credentialId !== 'string' ||
			!parsed.credentialId ||
			typeof parsed.salt !== 'string' ||
			!parsed.salt
		) {
			return null;
		}
		return { credentialId: parsed.credentialId, salt: parsed.salt };
	} catch {
		return null;
	}
}

export function clearE2eePasskeyHint(): void {
	try {
		localStorage.removeItem(E2EE_PASSKEY_HINT_KEY);
	} catch {}
}
