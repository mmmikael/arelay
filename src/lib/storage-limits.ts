import { formatBytes } from '$lib/artifacts';
import { PLAN_LIMITS, type PlanLimits } from '$lib/billing/plans';

export const MAX_ARTIFACT_BYTES = PLAN_LIMITS.free.maxArtifactBytes;
export const MAX_ACCOUNT_STORAGE_BYTES = PLAN_LIMITS.free.maxAccountStorageBytes;

/** Max JSON body size for encrypted artifact upload (base64 ciphertext + envelope fields). */
export function artifactUploadBodyLimitBytes(maxArtifactBytes: number): number {
	return Math.ceil((maxArtifactBytes * 4) / 3) + 2 * 1024 * 1024;
}

export const MAX_ARTIFACT_UPLOAD_BODY_BYTES = artifactUploadBodyLimitBytes(MAX_ARTIFACT_BYTES);

export function artifactUploadBodyTooLarge(
	contentLengthHeader: string | null,
	limitBytes: number = MAX_ARTIFACT_UPLOAD_BODY_BYTES
): boolean {
	if (!contentLengthHeader) return false;
	const contentLength = Number(contentLengthHeader);
	return Number.isFinite(contentLength) && contentLength > limitBytes;
}

export type StorageLimitErrorCode = 'artifact_too_large' | 'account_quota_exceeded';

export type StorageLimitCheckResult =
	| { ok: true }
	| { ok: false; code: StorageLimitErrorCode; message: string };

export function checkArtifactStorageLimits(
	incomingBytes: number,
	usedBytes: number,
	limits: PlanLimits = PLAN_LIMITS.free
): StorageLimitCheckResult {
	if (incomingBytes > limits.maxArtifactBytes) {
		return {
			ok: false,
			code: 'artifact_too_large',
			message: `Each file must be ${formatBytes(limits.maxArtifactBytes)} or smaller.`
		};
	}
	if (usedBytes + incomingBytes > limits.maxAccountStorageBytes) {
		const remaining = Math.max(0, limits.maxAccountStorageBytes - usedBytes);
		return {
			ok: false,
			code: 'account_quota_exceeded',
			message:
				remaining === 0
					? `Account storage limit of ${formatBytes(limits.maxAccountStorageBytes)} is full.`
					: `Upload would exceed the ${formatBytes(limits.maxAccountStorageBytes)} account storage limit (${formatBytes(remaining)} remaining).`
		};
	}
	return { ok: true };
}
