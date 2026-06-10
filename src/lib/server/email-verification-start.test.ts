import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POST as postEmailVerificationStart } from '../../routes/api/auth/email-verification/start/+server';

vi.mock('$lib/server/auth-rate-limit', () => ({
	EMAIL_VERIFICATION_PER_EMAIL_COOLDOWN_MS: 60_000,
	enforceEmailVerificationIpRateLimit: vi.fn(async () => ({ ok: true }))
}));

vi.mock('$lib/server/db', () => ({
	createEmailVerificationChallenge: vi.fn(),
	deleteEmailVerificationChallenge: vi.fn(),
	getRecentEmailVerificationCreatedAt: vi.fn(),
	getUserByEmail: vi.fn(),
	listCredentialsForUser: vi.fn()
}));

vi.mock('$lib/server/email-verification', () => ({
	EMAIL_VERIFICATION_MAX_AGE_MS: 900_000,
	generateVerificationCode: vi.fn(() => '123456'),
	hashVerificationCode: vi.fn(() => 'hash'),
	normalizeEmail: vi.fn((email: unknown) =>
		typeof email === 'string' && email.includes('@') ? email.trim().toLowerCase() : null
	),
	sendVerificationEmail: vi.fn(async () => ({ channel: 'email' as const }))
}));

import {
	createEmailVerificationChallenge,
	getRecentEmailVerificationCreatedAt,
	getUserByEmail,
	listCredentialsForUser
} from '$lib/server/db';
import { sendVerificationEmail } from '$lib/server/email-verification';

function locals() {
	return {
		requestId: 'req-1',
		log: { warn: vi.fn(), error: vi.fn() },
		authenticated: false,
		user: null,
		agentUser: null,
		currentPasskeyId: null
	} as unknown as App.Locals;
}

describe('POST /api/auth/email-verification/start', () => {
	beforeEach(() => {
		vi.mocked(getRecentEmailVerificationCreatedAt).mockReset();
		vi.mocked(getUserByEmail).mockReset();
		vi.mocked(listCredentialsForUser).mockReset();
		vi.mocked(createEmailVerificationChallenge).mockReset();
		vi.mocked(sendVerificationEmail).mockReset();
		vi.mocked(getRecentEmailVerificationCreatedAt).mockResolvedValue(null);
	});

	it('returns generic success and records cooldown for existing passkey accounts without sending email', async () => {
		vi.mocked(getUserByEmail).mockResolvedValue({ id: 'user-1' } as Awaited<
			ReturnType<typeof getUserByEmail>
		>);
		vi.mocked(listCredentialsForUser).mockResolvedValue([{ id: 'cred-1' }] as Awaited<
			ReturnType<typeof listCredentialsForUser>
		>);
		vi.mocked(createEmailVerificationChallenge).mockResolvedValue({ id: 'challenge-1' } as Awaited<
			ReturnType<typeof createEmailVerificationChallenge>
		>);

		const response = await postEmailVerificationStart({
			locals: locals(),
			request: new Request('http://localhost/api/auth/email-verification/start', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email: 'user@example.com' })
			}),
			url: new URL('http://localhost'),
			getClientAddress: () => '127.0.0.1'
		} as Parameters<typeof postEmailVerificationStart>[0]);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ ok: true, delivery: 'email' });
		expect(createEmailVerificationChallenge).toHaveBeenCalled();
		expect(sendVerificationEmail).not.toHaveBeenCalled();
	});
});
