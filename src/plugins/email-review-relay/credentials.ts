import { decryptSecret } from '$lib/server/secret-crypto';
import type { UserCloudflareEmailRecord } from './types';

export function isUserCloudflareEmailConfigured(record: UserCloudflareEmailRecord | null): boolean {
	return Boolean(record?.account_id_ciphertext?.trim() && record?.api_token_ciphertext?.trim());
}

export function decryptCloudflareAccountId(record: UserCloudflareEmailRecord): string | null {
	const ciphertext = record.account_id_ciphertext?.trim();
	if (!ciphertext) return null;
	return decryptSecret(ciphertext);
}
