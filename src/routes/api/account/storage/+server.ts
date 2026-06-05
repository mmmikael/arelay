import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAccountStorageUsedBytes } from '$lib/server/db';
import { MAX_ACCOUNT_STORAGE_BYTES, MAX_ARTIFACT_BYTES } from '$lib/storage-limits';

export const GET: RequestHandler = async ({ locals }) => {
	const usedBytes = await getAccountStorageUsedBytes(locals.user!.id);
	return json({
		usedBytes,
		limitBytes: MAX_ACCOUNT_STORAGE_BYTES,
		artifactLimitBytes: MAX_ARTIFACT_BYTES
	});
};
