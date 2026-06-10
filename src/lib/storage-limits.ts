import { formatBytes } from '$lib/artifacts';

export const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024;
export const MAX_ACCOUNT_STORAGE_BYTES = 500 * 1024 * 1024;

/** Max JSON body size for encrypted artifact upload (base64 ciphertext + envelope fields). */
export const MAX_ARTIFACT_UPLOAD_BODY_BYTES =
	Math.ceil((MAX_ARTIFACT_BYTES * 4) / 3) + 2 * 1024 * 1024;

export function artifactUploadBodyTooLarge(contentLengthHeader: string | null): boolean {
	if (!contentLengthHeader) return false;
	const contentLength = Number(contentLengthHeader);
	return Number.isFinite(contentLength) && contentLength > MAX_ARTIFACT_UPLOAD_BODY_BYTES;
}

export type StorageLimitErrorCode = 'artifact_too_large' | 'account_quota_exceeded';

export type StorageLimitCheckResult =
	| { ok: true }
	| { ok: false; code: StorageLimitErrorCode; message: string };

export function checkArtifactStorageLimits(
	incomingBytes: number,
	usedBytes: number
): StorageLimitCheckResult {
	if (incomingBytes > MAX_ARTIFACT_BYTES) {
		return {
			ok: false,
			code: 'artifact_too_large',
			message: `Each file must be ${formatBytes(MAX_ARTIFACT_BYTES)} or smaller.`
		};
	}
	if (usedBytes + incomingBytes > MAX_ACCOUNT_STORAGE_BYTES) {
		const remaining = Math.max(0, MAX_ACCOUNT_STORAGE_BYTES - usedBytes);
		return {
			ok: false,
			code: 'account_quota_exceeded',
			message:
				remaining === 0
					? `Account storage limit of ${formatBytes(MAX_ACCOUNT_STORAGE_BYTES)} is full.`
					: `Upload would exceed the ${formatBytes(MAX_ACCOUNT_STORAGE_BYTES)} account storage limit (${formatBytes(remaining)} remaining).`
		};
	}
	return { ok: true };
}
