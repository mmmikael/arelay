import { decryptPayloadBytes, type EncryptedPayload } from '$lib/e2ee';
import {
	getCachedArtifactPlaintext,
	setCachedArtifactPlaintext
} from '$lib/session-detail-cache';

export type ArtifactBytesSource = {
	id: string;
	encrypted_payload: EncryptedPayload | Record<string, unknown> | null;
};

const inflight = new Map<string, Promise<Uint8Array>>();

export async function fetchAndDecryptArtifactBytes(
	artifact: ArtifactBytesSource,
	privateKey: CryptoKey
): Promise<Uint8Array> {
	const cached = getCachedArtifactPlaintext(artifact.id);
	if (cached) return cached;

	const existing = inflight.get(artifact.id);
	if (existing) return existing;

	const promise = (async () => {
		if (!artifact.encrypted_payload) {
			throw new Error('Missing encrypted payload metadata');
		}

		const res = await fetch(`/api/artifacts/${artifact.id}/ciphertext`);
		if (!res.ok) throw new Error('Could not fetch encrypted artifact');
		const ciphertextBytes = new Uint8Array(await res.arrayBuffer());
		// Decrypt straight from the fetched bytes; round-tripping megabyte
		// ciphertexts through base64 stalls the main thread.
		const plaintext = await decryptPayloadBytes(
			artifact.encrypted_payload as EncryptedPayload,
			ciphertextBytes,
			privateKey
		);
		setCachedArtifactPlaintext(artifact.id, plaintext);
		return plaintext;
	})().finally(() => {
		inflight.delete(artifact.id);
	});

	inflight.set(artifact.id, promise);
	return promise;
}

export function forgetArtifactBytes(artifactId: string): void {
	inflight.delete(artifactId);
}
