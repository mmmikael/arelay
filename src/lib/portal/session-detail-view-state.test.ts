import { describe, expect, it } from 'vitest';
import {
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
