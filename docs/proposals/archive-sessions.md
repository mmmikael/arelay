# Proposal: Archive sessions

## Summary

Let users archive inbox sessions (single or multi-select), and hide archived
sessions from the default view behind an "Archived" filter. Archiving is a
reversible, metadata-only state change — it does **not** delete the session or
its artifacts, and unlike bulk artifact download it works for E2EE sessions
because it never touches encrypted payloads.

## Motivation

Today the only way to clear a session out of the inbox is to **delete** it,
which destroys the session and all its artifacts irreversibly
(`DELETE /api/sessions/[id]`). Users want to declutter the inbox without losing
the delivery. Archiving gives them a non-destructive "done with this, hide it"
action with a clear path back.

## Current state (what already exists)

The frontend already ships the archive **display** layer, dormant behind a
feature flag — so a large part of this feature is flipping it on and feeding it
real data:

- `SIDEBAR_ARCHIVE_FILTER_ENABLED = false` in
  `src/lib/portal/sidebar-types.ts` gates the archived filter chip and footer.
- `PortalInboxSidebar.svelte` already:
  - carries `is_archived?: boolean` on its `SessionRow` type,
  - excludes archived sessions from the `all` / `unread` / `email` / `files`
    filters and from the "N active" count,
  - renders an `archived` filter that shows only archived sessions,
  - has an "Archived" empty state and a "View archived sessions" footer link,
  - has full multi-select infrastructure (`selectionMode`, `selectedIds`,
    select-all, optimistic removal) — currently wired only to **Delete**.

What does **not** exist yet:

- No `archived_at` (or equivalent) column on `inbox_sessions`.
- `listSessions` / `getSession` / `toSessionView` do not select or expose an
  archived flag, so `is_archived` is always `undefined` on the client.
- No archive API endpoint or DB mutation. (Note: `/api/sessions/[id]/archive`
  already exists but is unrelated — it's an E2EE-only stub for _artifact bundle
  download_, not session archiving. Do not overload it.)
- The selection toolbar has no Archive button, and the inbox-version poll token
  does not reflect archive state.

## Proposed design

### Database

Add a nullable `archived_at timestamptz` to `inbox_sessions` (soft, reversible;
mirrors the existing `read_at` pattern). Add a partial index for the common
"active sessions" read path.

`src/lib/server/db-schema.ts`:

```ts
export const inboxSessions = pgTable(
	'inbox_sessions',
	{
		// ...existing columns...
		archivedAt: timestamp('archived_at', { withTimezone: true })
	},
	(table) => [
		index('idx_inbox_sessions_owner_user_id').on(table.ownerUserId),
		index('idx_inbox_sessions_updated_at').on(table.updatedAt.desc()),
		index('idx_inbox_sessions_owner_active')
			.on(table.ownerUserId, table.updatedAt.desc())
			.where(sql`${table.archivedAt} IS NULL`)
	]
);
```

Generate the Drizzle migration (`0003_*.sql`) — `ALTER TABLE ... ADD COLUMN
"archived_at"` + the new index. Existing rows default to `NULL` = not archived.

### Server data layer (`src/lib/server/db.ts`)

- Extend `InboxSession` type with `archived_at: Date | null` and a derived
  `is_archived: boolean`.
- Add `(s.archived_at IS NOT NULL) AS is_archived` (and `archived_at`) to the
  SELECTs in `listSessions`, `getSession`, `createEncryptedSession`,
  `updateEncryptedSession`, `setSessionReadState`.
- Add a `setSessionArchivedState(id, ownerUserId, archived)` mutation, mirroring
  `setSessionReadState`:

  ```sql
  UPDATE inbox_sessions
  SET archived_at = CASE WHEN ${archived} THEN NOW() ELSE NULL END
  WHERE id = ${id} AND owner_user_id = ${ownerUserId}
  RETURNING ... , (archived_at IS NOT NULL) AS is_archived
  ```

  Decision: **do not bump `updated_at`** on archive, so unarchiving restores the
  original sort position.

- Extend `getInboxSessionStats` to also return `archivedCount` so the poll token
  can detect archive/unarchive across tabs/devices (see Sync below).

### `toSessionView` (`src/lib/session-view.ts`)

Add `is_archived: boolean` to `SessionView` and pass it through. This is what
flows to the sidebar and flips `SIDEBAR_ARCHIVE_FILTER_ENABLED` on safely.

### API

Add a `PATCH` body field to the existing per-session endpoint
`/api/sessions/[id]` (mirrors the `is_read` flow already there), rather than a
new route:

```
PATCH /api/sessions/[id]   { "is_archived": true | false }
```

Returns the updated `toSessionView(session)`. 404 when the session doesn't
belong to the user. Multi-select archives N sessions client-side with N PATCH
calls (same shape as the current bulk-delete `Promise.allSettled` loop).

> Alternative considered: a dedicated `POST /api/sessions/[id]/archive`. Rejected
> to avoid colliding with the existing artifact-bundle `archive` route and
> because the `is_read` PATCH pattern already fits.

### Frontend (`PortalInboxSidebar.svelte`)

1. Flip `SIDEBAR_ARCHIVE_FILTER_ENABLED` to `true` once `is_archived` is real.
2. Add an **Archive** button to the multi-select toolbar next to Delete (reuse
   the already-imported `Archive` lucide icon). Add an optimistic
   `archive`/`unarchive` handler modeled on `doDeleteSessions` — optimistically
   move rows out of the active list, PATCH in the background, roll back on
   failure, then `invalidate('inbox:sessions')`.
3. In the `archived` filter, the per-row and bulk action should be **Unarchive**
   (toggle), plus Delete still available.
4. Optional: per-row hover Archive button alongside the existing read/delete
   hover actions.
5. No archive confirmation dialog (it's reversible) — unlike delete.

### Inbox version / polling sync

The portal polls `/api/inbox/version` and compares a token built in
`inbox-version.ts`. Because archiving won't change `sessionCount`, `readCount`,
or `latestUpdatedAt` (we don't bump `updated_at`), add `archivedCount` to
`InboxVersionInput` / `computeInboxVersionToken` and source it from the extended
`getInboxSessionStats`. This makes archive/unarchive propagate to other open
tabs and devices. The acting tab also invalidates locally as today.

## Out of scope (possible follow-ups)

- Auto-archive rules / retention policies.
- Archiving artifacts independently of their session.
- A distinct "Trash" with restore — delete stays immediate and permanent.
- Bulk "archive all read" shortcut.

## Acceptance criteria

- [ ] A new `archived_at` column + migration; existing sessions are unarchived.
- [ ] Selecting sessions and choosing **Archive** moves them out of the default
      view immediately and persists across reload.
- [ ] Default, Unread, Email, and Files filters exclude archived sessions; the
      "N active" count excludes them.
- [ ] The **Archived** filter lists only archived sessions and offers
      **Unarchive**.
- [ ] Archiving works for E2EE sessions (no decryption involved).
- [ ] Archive/unarchive syncs to other open tabs via the inbox poll.
- [ ] Archived sessions are still openable and can still be deleted.
- [ ] Unit coverage for `setSessionArchivedState`, the PATCH branch, and the
      sidebar filter logic.

## Rough task breakdown

1. Schema column + index + Drizzle migration.
2. `db.ts`: type, SELECTs, `setSessionArchivedState`, stats.
3. `session-view.ts`: expose `is_archived`.
4. `/api/sessions/[id]` PATCH: handle `is_archived`.
5. `inbox-version.ts` + `getInboxSessionStats`: `archivedCount`.
6. Sidebar: flip flag, add Archive/Unarchive actions + optimistic handler.
7. Tests + manual verification (archive, unarchive, reload, E2EE, multi-tab).
