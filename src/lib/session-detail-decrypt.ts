import { decryptString, type EncryptedEnvelope } from '$lib/e2ee';

export async function decryptEncryptedSessionMeta(
	encryptedTitle: EncryptedEnvelope | Record<string, unknown> | null | undefined,
	encryptedSummary: EncryptedEnvelope | Record<string, unknown> | null | undefined,
	privateKey: CryptoKey
): Promise<{ title: string; summary: string | null } | null> {
	if (!encryptedTitle) return null;

	try {
		const title = await decryptString(encryptedTitle as EncryptedEnvelope, privateKey);
		const summary = encryptedSummary
			? await decryptString(encryptedSummary as EncryptedEnvelope, privateKey)
			: null;
		return { title, summary };
	} catch {
		return null;
	}
}
