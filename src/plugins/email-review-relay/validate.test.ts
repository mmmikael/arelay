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
		const result = parseEmailDraftSendFields(validApprovePayload);
		expect(result.ok).toBe(true);
	});

	it('rejects invalid email addresses', () => {
		expect(parseEmailDraftSendFields({ ...validApprovePayload, to: 'not-an-email' }).ok).toBe(
			false
		);
		expect(parseEmailDraftSendFields({ ...validApprovePayload, from: { email: 'bad' } }).ok).toBe(
			false
		);
	});

	it('requires subject and html', () => {
		expect(parseEmailDraftSendFields({ ...validApprovePayload, subject: '  ' }).ok).toBe(false);
		expect(parseEmailDraftSendFields({ ...validApprovePayload, html: '' }).ok).toBe(false);
	});

	it('parses and normalizes optional cc/bcc lists', () => {
		const result = parseEmailDraftSendFields({
			...validApprovePayload,
			cc: 'A@Example.com, b@example.com',
			bcc: 'me@example.com'
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.cc).toBe('a@example.com, b@example.com');
		expect(result.value.bcc).toBe('me@example.com');
	});

	it('treats empty cc/bcc as absent and rejects invalid entries', () => {
		const empty = parseEmailDraftSendFields({ ...validApprovePayload, cc: '', bcc: '   ' });
		expect(empty.ok).toBe(true);
		if (empty.ok) {
			expect(empty.value.cc).toBeUndefined();
			expect(empty.value.bcc).toBeUndefined();
		}
		expect(
			parseEmailDraftSendFields({ ...validApprovePayload, cc: 'good@x.com, not-an-email' }).ok
		).toBe(false);
	});
});

describe('parseEmailDraftBody encrypted cc/bcc', () => {
	it('accepts optional encrypted_cc/encrypted_bcc envelopes', () => {
		const result = parseEmailDraftBody({
			encrypted: true,
			encrypted_to: envelope,
			encrypted_cc: envelope,
			encrypted_bcc: envelope,
			encrypted_from_email: envelope,
			encrypted_subject: envelope,
			encrypted_html: envelope
		});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.encrypted_cc).toEqual(envelope);
		expect(result.value.encrypted_bcc).toEqual(envelope);
	});

	it('rejects a malformed encrypted_bcc envelope', () => {
		const result = parseEmailDraftBody({
			encrypted: true,
			encrypted_to: envelope,
			encrypted_bcc: { not: 'an envelope' },
			encrypted_from_email: envelope,
			encrypted_subject: envelope,
			encrypted_html: envelope
		});
		expect(result.ok).toBe(false);
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
