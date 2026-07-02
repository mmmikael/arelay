import { decryptSecret } from '$lib/server/secret-crypto';
import type { UserStripeCredentialsRecord } from './types';

export function isUserStripeConfigured(
	record: UserStripeCredentialsRecord | null
): record is UserStripeCredentialsRecord {
	return Boolean(record?.secret_key_ciphertext?.trim());
}

export function decryptStripeSecretKey(record: UserStripeCredentialsRecord): string | null {
	const ciphertext = record.secret_key_ciphertext?.trim();
	if (!ciphertext) return null;
	return decryptSecret(ciphertext);
}

/** True when the configured key is a Stripe test-mode key (sk_test_… / rk_test_…). */
export function isStripeTestKey(secretKey: string): boolean {
	return /^(sk|rk)_test_/.test(secretKey.trim());
}
