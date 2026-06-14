/**
 * Dependency identifiers the inbox background poll invalidates once it detects
 * a change in the inbox version token.
 *
 * This MUST include both the sidebar list (`inbox:sessions`, owned by the
 * portal layout load) AND the open session detail (`inbox:session`, owned by
 * the [sessionId] page load). The inbox version token also bumps when the
 * currently-open session's own content changes (its `updated_at` or its email
 * draft), so dropping `inbox:session` would refresh the sidebar while leaving
 * the right-hand detail panel showing stale data — a visible mismatch between
 * the selected session and the message rendered beside it.
 *
 * `invalidate` only re-runs loads that are currently active, so listing
 * `inbox:session` is a no-op when no detail page is open.
 */
export const INBOX_POLL_INVALIDATIONS = [
	'inbox:sessions',
	'inbox:session',
	'account:storage'
] as const;
