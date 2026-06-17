import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { toSessionView } from '$lib/session-view';
import { listSessions } from '$lib/server/db';

// Human-authed inbox listing (the portal session cookie gates all non-agent
// /api/* routes). Mirrors GET /api/agent/sessions, but for a logged-in person
// rather than an agent token — this is the list endpoint a reader frontend
// (e.g. @arelay/client's ArelayReader) needs to discover sessions.
export const GET: RequestHandler = async ({ locals }) => {
	const sessions = await listSessions(locals.user!.id);
	return json({ sessions: sessions.map(toSessionView) });
};
