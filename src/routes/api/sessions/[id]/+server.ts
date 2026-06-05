import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	deleteSession,
	getSession,
	listArtifacts,
	listArtifactStorageKeys,
	setSessionReadState
} from '$lib/server/db';
import { deleteObjects } from '$lib/server/s3';

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
	}

	const body = (await request.json()) as { is_read?: boolean };
	if (typeof body.is_read !== 'boolean') {
		return json({ error: 'is_read boolean required' }, { status: 400 });
	}

	const session = await setSessionReadState(sessionId, locals.user!.id, body.is_read);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	return json({ session });
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
	}

	const existing = await getSession(sessionId, locals.user!.id);
	if (!existing) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	const keys = await listArtifactStorageKeys(sessionId, locals.user!.id);
	try {
		await deleteObjects(keys);
	} catch (err) {
		console.error('[sessions] S3 cleanup failed:', err);
	}

	const deleted = await deleteSession(sessionId, locals.user!.id);
	if (!deleted) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	return new Response(null, { status: 204 });
};

export const GET: RequestHandler = async ({ locals, params }) => {
	const sessionId = params.id;
	if (!sessionId) {
		return json({ error: 'Session id required' }, { status: 400 });
	}

	const [session, artifacts] = await Promise.all([
		getSession(sessionId, locals.user!.id),
		listArtifacts(sessionId, locals.user!.id)
	]);
	if (!session) {
		return json({ error: 'Session not found' }, { status: 404 });
	}

	return json({ session, artifacts });
};
