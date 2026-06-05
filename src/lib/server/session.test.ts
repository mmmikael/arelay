import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		SESSION_SECRET: 'test-session-secret-for-unit-tests',
		SESSION_VERSION: '1'
	}
}));

import { createSession, createSignedValue, verifySession, verifySignedValue } from './session';

describe('createSignedValue', () => {
	it('round-trips signed payloads', () => {
		const payload = { userId: 'user-1', role: 'human' };
		const cookie = createSignedValue(payload);
		expect(verifySignedValue<typeof payload>(cookie)).toEqual(payload);
	});

	it('rejects tampered signatures', () => {
		const cookie = createSignedValue({ ok: true });
		const tampered = `${cookie.slice(0, -1)}${cookie.endsWith('a') ? 'b' : 'a'}`;
		expect(verifySignedValue(tampered)).toBeNull();
	});
});

describe('createSession', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-05T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('creates and verifies a human session cookie', () => {
		const { cookieValue } = createSession('user-123', 'passkey-456');
		const verified = verifySession(cookieValue);
		expect(verified).toEqual({
			authenticated: true,
			userId: 'user-123',
			credentialId: 'passkey-456'
		});
	});

	it('rejects expired sessions', () => {
		const { cookieValue } = createSession('user-123', 'passkey-456');
		vi.setSystemTime(new Date('2026-06-20T12:00:00Z'));
		expect(verifySession(cookieValue)).toEqual({
			authenticated: false,
			userId: null,
			credentialId: null
		});
	});

	it('rejects cookies without the session format prefix', () => {
		expect(verifySession('invalid.session.value')).toEqual({
			authenticated: false,
			userId: null,
			credentialId: null
		});
	});
});
