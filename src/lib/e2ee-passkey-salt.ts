// Deterministic, app-wide WebAuthn PRF salt used to wrap the E2EE private key.
//
// A constant salt lets the login ceremony evaluate PRF without first knowing
// which user is signing in, which enables single-prompt unlock on a fresh
// browser (the per-credential secret inside the authenticator still makes the
// derived key unique and secret). These bytes are SHA-256("Agent Relay E2EE
// passkey PRF unlock v1"); changing them would invalidate every deterministic
// passkey-wrapped private key, so the value is locked by a test.
const DETERMINISTIC_PRF_SALT = new Uint8Array([
	48, 215, 167, 94, 31, 193, 173, 125, 129, 211, 139, 120, 206, 194, 156, 250, 28,
	165, 40, 248, 104, 129, 119, 247, 74, 228, 115, 128, 227, 125, 87, 94
]);

function bytesToBase64Url(bytes: Uint8Array): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
	let out = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const b0 = bytes[i];
		const b1 = i + 1 < bytes.length ? bytes[i + 1] : undefined;
		const b2 = i + 2 < bytes.length ? bytes[i + 2] : undefined;
		out += alphabet[b0 >> 2];
		out += alphabet[((b0 & 0b11) << 4) | ((b1 ?? 0) >> 4)];
		if (b1 === undefined) break;
		out += alphabet[((b1 & 0b1111) << 2) | ((b2 ?? 0) >> 6)];
		if (b2 === undefined) break;
		out += alphabet[b2 & 0b111111];
	}
	return out;
}

export function deterministicPrfSaltBytes(): Uint8Array {
	return new Uint8Array(DETERMINISTIC_PRF_SALT);
}

export const DETERMINISTIC_PRF_SALT_B64URL = bytesToBase64Url(deterministicPrfSaltBytes());
