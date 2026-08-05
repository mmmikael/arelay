import { checkArtifactStorageLimits } from '$lib/storage-limits';
import { planLimits, type PlanLimits } from '$lib/billing/plans';
import { getAccountStorageUsedBytes } from '$lib/server/db';
import { getEffectivePlan } from '$lib/server/billing/db';

/** Plan-resolved storage limits for an account (free plan when billing is disabled). */
export async function resolveStorageLimits(ownerUserId: string): Promise<PlanLimits> {
	return planLimits(await getEffectivePlan(ownerUserId));
}

export async function validateArtifactStorageUpload(
	ownerUserId: string,
	incomingBytes: number,
	limits?: PlanLimits
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
	const effectiveLimits = limits ?? (await resolveStorageLimits(ownerUserId));
	const usedBytes = await getAccountStorageUsedBytes(ownerUserId);
	const result = checkArtifactStorageLimits(incomingBytes, usedBytes, effectiveLimits);
	if (!result.ok) {
		return {
			ok: false,
			status: result.code === 'artifact_too_large' ? 413 : 507,
			error: result.message
		};
	}
	return { ok: true };
}
