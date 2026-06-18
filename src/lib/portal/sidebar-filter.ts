import type { SidebarFilter } from './sidebar-types';

/** Minimal shape the sidebar filters reason about. */
export type FilterableSession = {
	id: string;
	is_read: boolean;
	is_archived?: boolean;
	artifact_count?: number;
};

/** Archived sessions are hidden everywhere except the dedicated archived filter. */
export function isActiveSession(session: FilterableSession): boolean {
	return !session.is_archived;
}

/** The "N active" count excludes archived sessions. */
export function countActiveSessions(sessions: FilterableSession[]): number {
	return sessions.filter(isActiveSession).length;
}

/**
 * The single source of truth for which sessions a sidebar filter shows. Every
 * non-archived filter excludes archived sessions; only `archived` shows them.
 * `hasEmailDraft` is injected so this stays pure and unit-testable.
 */
export function filterSidebarSessions<T extends FilterableSession>(
	sessions: T[],
	filter: SidebarFilter,
	hasEmailDraft: (id: string) => boolean
): T[] {
	switch (filter) {
		case 'unread':
			return sessions.filter((session) => !session.is_read && isActiveSession(session));
		case 'email':
			return sessions.filter((session) => hasEmailDraft(session.id) && isActiveSession(session));
		case 'files':
			return sessions.filter(
				(session) => (session.artifact_count ?? 0) > 0 && isActiveSession(session)
			);
		case 'archived':
			return sessions.filter((session) => Boolean(session.is_archived));
		default:
			return sessions.filter(isActiveSession);
	}
}
