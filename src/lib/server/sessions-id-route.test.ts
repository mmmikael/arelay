import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from '../../routes/api/sessions/[id]/+server';

vi.mock('$lib/server/db', () => ({
	deleteSession: vi.fn(),
	getSession: vi.fn(),
	listArtifacts: vi.fn(),
	listArtifactStorageKeys: vi.fn(),
	setSessionArchivedState: vi.fn(),
	setSessionReadState: vi.fn()
}));

vi.mock('$lib/server/s3', () => ({
	deleteObjects: vi.fn()
}));

import { setSessionArchivedState, setSessionReadState } from '$lib/server/db';
import type { InboxSession } from '$lib/server/db';

const envelope = { v: 1, alg: 'P-256-ECDH-A256GCM', epk: {}, iv: 'a', ciphertext: 'b' };

function makeSession(overrides: Partial<InboxSession> = {}): InboxSession {
	return {
		id: 'session-1',
		owner_user_id: 'user-1',
		encryption_version: 'e2ee-v1',
		encrypted_title: envelope,
		encrypted_summary: null,
		read_at: null,
		archived_at: null,
		created_at: new Date('2026-06-06T12:00:00Z'),
		updated_at: new Date('2026-06-06T12:00:00Z'),
		is_read: false,
		is_archived: false,
		...overrides
	};
}

function humanLocals() {
	return { user: { id: 'user-1' } } as App.Locals;
}

function patch(body: unknown) {
	return PATCH({
		locals: humanLocals(),
		params: { id: 'session-1' },
		request: new Request('http://localhost/api/sessions/session-1', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as unknown as Parameters<typeof PATCH>[0]);
}

describe('PATCH /api/sessions/[id]', () => {
	beforeEach(() => {
		vi.mocked(setSessionArchivedState).mockReset();
		vi.mocked(setSessionReadState).mockReset();
	});

	it('archives a session and returns the updated view', async () => {
		const archivedAt = new Date('2026-06-18T09:00:00Z');
		vi.mocked(setSessionArchivedState).mockResolvedValue(
			makeSession({ archived_at: archivedAt, is_archived: true })
		);

		const response = await patch({ is_archived: true });

		expect(setSessionArchivedState).toHaveBeenCalledWith('session-1', 'user-1', true);
		expect(setSessionReadState).not.toHaveBeenCalled();
		expect(response.status).toBe(200);
		const payload = (await response.json()) as { session: { is_archived: boolean } };
		expect(payload.session.is_archived).toBe(true);
		// The raw timestamp is never exposed in the view.
		expect('archived_at' in payload.session).toBe(false);
	});

	it('unarchives a session', async () => {
		vi.mocked(setSessionArchivedState).mockResolvedValue(makeSession({ is_archived: false }));

		const response = await patch({ is_archived: false });

		expect(setSessionArchivedState).toHaveBeenCalledWith('session-1', 'user-1', false);
		expect(response.status).toBe(200);
		const payload = (await response.json()) as { session: { is_archived: boolean } };
		expect(payload.session.is_archived).toBe(false);
	});

	it('returns 404 when the session is not owned by the user', async () => {
		vi.mocked(setSessionArchivedState).mockResolvedValue(null);

		const response = await patch({ is_archived: true });

		expect(response.status).toBe(404);
	});

	it('still handles is_read without touching archive state', async () => {
		vi.mocked(setSessionReadState).mockResolvedValue(makeSession({ is_read: true }));

		const response = await patch({ is_read: true });

		expect(setSessionReadState).toHaveBeenCalledWith('session-1', 'user-1', true);
		expect(setSessionArchivedState).not.toHaveBeenCalled();
		expect(response.status).toBe(200);
	});

	it('rejects a body with neither is_read nor is_archived', async () => {
		const response = await patch({ something_else: true });

		expect(response.status).toBe(400);
		expect(setSessionArchivedState).not.toHaveBeenCalled();
		expect(setSessionReadState).not.toHaveBeenCalled();
	});

	it('prefers is_archived when both flags are present', async () => {
		vi.mocked(setSessionArchivedState).mockResolvedValue(makeSession({ is_archived: true }));

		await patch({ is_archived: true, is_read: true });

		expect(setSessionArchivedState).toHaveBeenCalledOnce();
		expect(setSessionReadState).not.toHaveBeenCalled();
	});
});
