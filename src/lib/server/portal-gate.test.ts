import { describe, expect, it } from 'vitest';
import { resolvePortalE2eeRedirect } from './portal-gate';

describe('resolvePortalE2eeRedirect', () => {
	it('sends unconfigured users to setup except account and setup pages', () => {
		expect(resolvePortalE2eeRedirect('/portal', false)).toBe('/portal/setup');
		expect(resolvePortalE2eeRedirect('/portal/session-1', false)).toBe('/portal/setup');
		expect(resolvePortalE2eeRedirect('/portal/setup', false)).toBeNull();
		expect(resolvePortalE2eeRedirect('/portal/account', false)).toBeNull();
	});

	it('sends configured users away from setup', () => {
		expect(resolvePortalE2eeRedirect('/portal/setup', true)).toBe('/portal');
		expect(resolvePortalE2eeRedirect('/portal', true)).toBeNull();
	});
});
