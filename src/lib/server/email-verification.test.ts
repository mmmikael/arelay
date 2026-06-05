import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: {
		SESSION_SECRET: 'test-session-secret-for-unit-tests'
	}
}));

import {
	generateSignupVerificationToken,
	generateVerificationCode,
	hashSignupVerificationToken,
	hashVerificationCode,
	normalizeEmail,
	normalizeVerificationCode
} from './email-verification';

describe('normalizeEmail', () => {
	it('accepts valid emails and normalizes casing', () => {
		expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
	});

	it('rejects invalid values', () => {
		expect(normalizeEmail('not-an-email')).toBeNull();
		expect(normalizeEmail(null)).toBeNull();
	});
});

describe('normalizeVerificationCode', () => {
	it('extracts six digits from formatted input', () => {
		expect(normalizeVerificationCode('123 456')).toBe('123456');
		expect(normalizeVerificationCode('12-34-56')).toBe('123456');
	});

	it('rejects codes that are not six digits', () => {
		expect(normalizeVerificationCode('12345')).toBeNull();
		expect(normalizeVerificationCode('abcdef')).toBeNull();
	});
});

describe('verification hashes', () => {
	it('hashes codes and signup tokens deterministically', () => {
		const codeHash = hashVerificationCode('user@example.com', '123456');
		expect(codeHash).toHaveLength(64);
		expect(hashVerificationCode('user@example.com', '123456')).toBe(codeHash);
		expect(hashVerificationCode('user@example.com', '654321')).not.toBe(codeHash);

		const token = 'signup-token-value';
		const tokenHash = hashSignupVerificationToken(token);
		expect(tokenHash).toHaveLength(64);
		expect(hashSignupVerificationToken(token)).toBe(tokenHash);
	});
});

describe('token generators', () => {
	it('generates six-digit verification codes', () => {
		const code = generateVerificationCode();
		expect(code).toMatch(/^\d{6}$/);
	});

	it('generates signup verification tokens', () => {
		const token = generateSignupVerificationToken();
		expect(token.length).toBeGreaterThan(20);
		expect(generateSignupVerificationToken()).not.toBe(token);
	});
});
