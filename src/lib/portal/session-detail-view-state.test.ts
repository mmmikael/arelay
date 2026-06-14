import { describe, expect, it } from 'vitest';
import {
	emailDraftForActiveSession,
	emptySessionDetailViewState,
	sessionDetailViewFromCache,
	type SessionDetailCacheSnapshot
} from './session-detail-view-state';

const partnerDraft = {
	to: 'partner@example.com',
	subject: 'Weekly partner check-in',
	html: '<p>Weekly update</p>'
} as never;

const investorDraft = {
	to: 'investor@example.com',
	subject: 'Intro: AI startup feedback',
	html: '<p>Startup intro</p>'
} as never;

describe('sessionDetailViewFromCache', () => {
	it('returns empty decrypt state when cache misses', () => {
		expect(sessionDetailViewFromCache(true, null)).toEqual({
			session: null,
			artifacts: {},
			emailDraft: null
		});
	});

	it('does not expose a cached email draft for non-draft sessions', () => {
		const cached: SessionDetailCacheSnapshot = {
			session: { title: 'Weekly Sales Summary', summary: null },
			artifacts: {
				'artifact-1': { filename: 'sales-summary.md', contentType: 'text/markdown' }
			},
			emailDraft: partnerDraft
		};

		expect(sessionDetailViewFromCache(false, cached).emailDraft).toBeNull();
	});

	it('uses cached decrypt results when the session is already warm', () => {
		const cached: SessionDetailCacheSnapshot = {
			session: { title: 'Intro: AI startup feedback', summary: 'To: investor@example.com' },
			artifacts: {},
			emailDraft: investorDraft
		};

		expect(sessionDetailViewFromCache(true, cached)).toEqual({
			session: cached.session,
			artifacts: {},
			emailDraft: investorDraft
		});
	});

	it('clears artifacts when cache has none yet', () => {
		const cached: SessionDetailCacheSnapshot = {
			session: { title: 'Customer onboarding packet', summary: null },
			artifacts: {},
			emailDraft: undefined
		};

		expect(sessionDetailViewFromCache(false, cached).artifacts).toEqual({});
	});
});

describe('emptySessionDetailViewState', () => {
	it('matches the locked-session baseline', () => {
		expect(emptySessionDetailViewState()).toEqual({
			session: null,
			artifacts: {},
			emailDraft: null
		});
	});
});

describe('emailDraftForActiveSession', () => {
	it('exposes the draft when it belongs to the active session', () => {
		expect(emailDraftForActiveSession(investorDraft, 'session-b', 'session-b')).toBe(investorDraft);
	});

	// The regression: during the navigation window the decrypt effect has not
	// re-run yet, so the still-decrypted draft belongs to the previously viewed
	// session while the active session id has already advanced. Returning it
	// would render one session's title beside another's email body.
	it('hides a draft left over from the previously viewed session', () => {
		expect(emailDraftForActiveSession(partnerDraft, 'session-a', 'session-b')).toBeNull();
	});

	it('returns null when nothing is decrypted yet', () => {
		expect(emailDraftForActiveSession(null, null, 'session-b')).toBeNull();
		expect(emailDraftForActiveSession(null, 'session-b', 'session-b')).toBeNull();
	});
});
