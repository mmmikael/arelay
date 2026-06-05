export function shouldShowPasskeyStorageHint(): boolean {
	if (typeof navigator === 'undefined') return false;
	const ua = navigator.userAgent;
	const isMac = /Macintosh|Mac OS X/i.test(ua);
	const isChromium = /Chrome|Chromium|Edg|OPR|Arc/i.test(ua);
	return isMac && isChromium;
}

export const PASSKEY_STORAGE_HINT =
	'Encryption unlocks your private key through your passkey. On Mac, Chrome, Arc, and Edge often default to a browser passkey store that cannot do this—choose iCloud Keychain (Passwords) when prompted. Safari uses iCloud Keychain by default.';

export const ENCRYPTION_PASSKEY_FALLBACK_NOTICE =
	'Your account passkey cannot unlock encryption in this browser. You can create a separate encryption passkey instead—choose iCloud Keychain (Passwords) if you are on Mac.';

export function isPasskeyPrfError(message: string): boolean {
	return (
		message.includes('PRF') ||
		message.includes('passkey did not return') ||
		message.includes('Passkey unlock was cancelled') ||
		message.includes('Passkeys are not available')
	);
}

export function withPasskeyPrfFailureHint(message: string): string {
	if (!shouldShowPasskeyStorageHint() || !isPasskeyPrfError(message)) {
		return message;
	}
	return `${message} ${PASSKEY_STORAGE_HINT}`;
}
