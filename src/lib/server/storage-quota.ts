import { checkArtifactStorageLimits } from '$lib/storage-limits';
import { getAccountStorageUsedBytes } from '$lib/server/db';

export async function validateArtifactStorageUpload(
	ownerUserId: string,
	incomingBytes: number
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	const usedBytes = await getAccountStorageUsedBytes(ownerUserId);
	const result = checkArtifactStorageLimits(incomingBytes, usedBytes);
	if (!result.ok) {
		return {
			ok: false,
			status: result.code === 'artifact_too_large' ? 413 : 507,
			error: result.message
		};
	}
	return { ok: true };
}
