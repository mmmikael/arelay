import type { PageServerLoad } from './$types';
import { listSessions } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
	const sessions = await listSessions(locals.user!.id);
	return { sessions };
};
