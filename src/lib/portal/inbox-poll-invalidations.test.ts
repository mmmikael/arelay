import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INBOX_POLL_INVALIDATIONS } from './inbox-poll-invalidations';

const layoutLoadSrc = readFileSync(
	fileURLToPath(new URL('../../routes/portal/+layout.server.ts', import.meta.url)),
	'utf8'
);
const sessionLoadSrc = readFileSync(
	fileURLToPath(new URL('../../routes/portal/[sessionId]/+page.server.ts', import.meta.url)),
	'utf8'
);

describe('INBOX_POLL_INVALIDATIONS', () => {
	// The regression this guards: the background poll once refreshed only the
	// sidebar list, leaving the open detail panel stale when the active session's
	// own content changed — the selected session and the message beside it no
	// longer matched.
	it('refreshes the open session detail, not just the sidebar list', () => {
		expect(INBOX_POLL_INVALIDATIONS).toContain('inbox:session');
	});

	it('refreshes the sidebar list and storage meter too', () => {
		expect(INBOX_POLL_INVALIDATIONS).toContain('inbox:sessions');
		expect(INBOX_POLL_INVALIDATIONS).toContain('account:storage');
	});

	it('has no duplicate identifiers', () => {
		expect(new Set(INBOX_POLL_INVALIDATIONS).size).toBe(INBOX_POLL_INVALIDATIONS.length);
	});

	// Each invalidated identifier must be declared by a load via depends(),
	// otherwise the poll silently no-ops and the panel goes stale again. This
	// also breaks if either side renames its dependency key.
	it('every poll dependency is declared by a load', () => {
		const declared = `${layoutLoadSrc}\n${sessionLoadSrc}`;
		for (const dep of INBOX_POLL_INVALIDATIONS) {
			expect(declared, `no load declares depends('${dep}')`).toContain(`depends('${dep}')`);
		}
	});

	it('the open session detail load declares inbox:session', () => {
		expect(sessionLoadSrc).toContain("depends('inbox:session')");
	});
});
