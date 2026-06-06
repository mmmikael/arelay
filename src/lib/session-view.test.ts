import { describe, expect, it } from 'vitest';
import { toSessionView } from './session-view';
import type { InboxSession } from '$lib/server/db';

const envelope = { v: 1, alg: 'P-256-ECDH-A256GCM', epk: {}, iv: 'a', ciphertext: 'b' };

function makeSession(): InboxSession {
	return {
		id: 'session-1',
		owner_user_id: 'user-1',
		encryption_version: 'e2ee-v1',
		encrypted_title: envelope,
		encrypted_summary: null,
		read_at: null,
		created_at: new Date('2026-06-06T12:00:00Z'),
		updated_at: new Date('2026-06-06T12:00:00Z'),
		is_read: false,
		artifact_count: 2
	};
}

describe('toSessionView', () => {
	it('returns encrypted session fields only', () => {
		const view = toSessionView(makeSession());
		expect(view).toEqual({
			id: 'session-1',
			owner_user_id: 'user-1',
			encryption_version: 'e2ee-v1',
			encrypted_title: envelope,
			encrypted_summary: null,
			read_at: null,
			created_at: new Date('2026-06-06T12:00:00Z'),
			updated_at: new Date('2026-06-06T12:00:00Z'),
			is_read: false,
			artifact_count: 2
		});
		expect('title' in view).toBe(false);
		expect('summary' in view).toBe(false);
	});
});
