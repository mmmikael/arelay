import { describe, expect, it } from 'vitest';
import {
	isEncryptedEnvelope,
	parseEmailDraftApproveFields,
	parseEmailDraftBody,
	parseEmailDraftReviewBody,
	parseEmailDraftSendFields
} from './validate';

const envelope = {
	v: 1,
	alg: 'P-256-ECDH-A256GCM',
	epk: { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' },
	iv: 'iv',
	ciphertext: 'cipher'
};

const validApprovePayload = {
	to: 'user@example.com',
	from: { email: 'noreply@yourdomain.com', name: 'Your Company' },
	subject: 'Hello',
	html: '<p>Hi</p>',
	text: 'Hi'
};

describe('isEncryptedEnvelope', () => {
	it('accepts valid envelopes', () => {
		expect(isEncryptedEnvelope(envelope)).toBe(true);
	});

	it('rejects invalid envelopes', () => {
		expect(isEncryptedEnvelope(null)).toBe(false);
		expect(isEncryptedEnvelope({ ...envelope, alg: 'bad' })).toBe(false);
	});
});

describe('parseEmailDraftBody', () => {
	it('accepts encrypted email draft payloads', () => {
		const result = parseEmailDraftBody({
			encrypted: true,
			encrypted_to: envelope,
			encrypted_from_email: envelope,
			encrypted_subject: envelope,
			encrypted_html: envelope
		});
		expect(result.ok).toBe(true);
	});

	it('rejects plaintext payloads', () => {
		const result = parseEmailDraftBody(validApprovePayload);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.error).toContain('encrypted must be true');
	});
});

describe('parseEmailDraftSendFields', () => {
	it('validates decrypted approve payloads', () => {
		const result = parseEmailDraftSendFields({
			...validApprovePayload,
			cc: ['Copy@Example.com'],
			bcc: 'archive@example.com'
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.cc).toEqual(['copy@example.com']);
		expect(result.value.bcc).toEqual(['archive@example.com']);
	});

	it('rejects invalid email addresses', () => {
		expect(parseEmailDraftSendFields({ ...validApprovePayload, to: 'not-an-email' }).ok).toBe(
			false
		);
		expect(parseEmailDraftSendFields({ ...validApprovePayload, from: { email: 'bad' } }).ok).toBe(
			false
		);
		expect(parseEmailDraftSendFields({ ...validApprovePayload, cc: ['bad'] }).ok).toBe(false);
	});

	it('enforces the combined recipient limit', () => {
		const cc = Array.from({ length: 50 }, (_, index) => `copy-${index}@example.com`);
		expect(parseEmailDraftSendFields({ ...validApprovePayload, cc }).ok).toBe(false);
	});

	it('requires subject and html', () => {
		expect(parseEmailDraftSendFields({ ...validApprovePayload, subject: '  ' }).ok).toBe(false);
		expect(parseEmailDraftSendFields({ ...validApprovePayload, html: '' }).ok).toBe(false);
	});
});

describe('parseEmailDraftApproveFields', () => {
	it('accepts optional encrypted_sent envelope', () => {
		const result = parseEmailDraftApproveFields({
			...validApprovePayload,
			encrypted_sent: envelope
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.encrypted_sent).toEqual(envelope);
	});
});

describe('parseEmailDraftReviewBody', () => {
	it('accepts encrypted review bundle and null clears', () => {
		expect(parseEmailDraftReviewBody({ encrypted: true, encrypted_review: envelope }).ok).toBe(
			true
		);
		expect(parseEmailDraftReviewBody({ encrypted: true, encrypted_review: null }).ok).toBe(true);
	});

	it('requires encrypted true', () => {
		expect(parseEmailDraftReviewBody({ encrypted_review: envelope }).ok).toBe(false);
	});
});
