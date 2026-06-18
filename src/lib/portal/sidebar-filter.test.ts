import { describe, expect, it } from 'vitest';
import {
	countActiveSessions,
	filterSidebarSessions,
	isActiveSession,
	type FilterableSession
} from './sidebar-filter';

function session(overrides: Partial<FilterableSession> & { id: string }): FilterableSession {
	return {
		is_read: true,
		is_archived: false,
		artifact_count: 0,
		...overrides
	};
}

const sessions: FilterableSession[] = [
	session({ id: 'active-read' }),
	session({ id: 'active-unread', is_read: false }),
	session({ id: 'active-files', artifact_count: 2 }),
	session({ id: 'active-email' }),
	session({ id: 'archived-unread', is_read: false, is_archived: true }),
	session({ id: 'archived-files', artifact_count: 3, is_archived: true })
];

const hasEmailDraft = (id: string) => id === 'active-email';

describe('isActiveSession / countActiveSessions', () => {
	it('treats only non-archived sessions as active', () => {
		expect(isActiveSession(session({ id: 'a' }))).toBe(true);
		expect(isActiveSession(session({ id: 'b', is_archived: true }))).toBe(false);
		expect(countActiveSessions(sessions)).toBe(4);
	});
});

describe('filterSidebarSessions', () => {
	const ids = (filter: Parameters<typeof filterSidebarSessions>[1]) =>
		filterSidebarSessions(sessions, filter, hasEmailDraft).map((s) => s.id);

	it('default (all) excludes archived sessions', () => {
		expect(ids('all')).toEqual(['active-read', 'active-unread', 'active-files', 'active-email']);
	});

	it('unread excludes archived sessions', () => {
		// archived-unread is unread but archived, so it must not appear here.
		expect(ids('unread')).toEqual(['active-unread']);
	});

	it('email filter uses the predicate and excludes archived sessions', () => {
		expect(ids('email')).toEqual(['active-email']);
	});

	it('files excludes archived sessions even when they have artifacts', () => {
		expect(ids('files')).toEqual(['active-files']);
	});

	it('archived shows only archived sessions', () => {
		expect(ids('archived')).toEqual(['archived-unread', 'archived-files']);
	});
});
