import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAccountStorageUsedBytes } from '$lib/server/db';
import { getEffectivePlan } from '$lib/server/billing/db';
import { planLimits } from '$lib/billing/plans';

export const GET: RequestHandler = async ({ locals }) => {
	const [usedBytes, plan] = await Promise.all([
		getAccountStorageUsedBytes(locals.user!.id),
		getEffectivePlan(locals.user!.id)
	]);
	const limits = planLimits(plan);
	return json({
		usedBytes,
		limitBytes: limits.maxAccountStorageBytes,
		artifactLimitBytes: limits.maxArtifactBytes,
		plan
	});
};
