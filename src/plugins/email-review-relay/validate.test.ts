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

	it('accepts optional agent-supplied encrypted_cc/encrypted_bcc envelopes', () => {
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

	it('accepts validated inline image attachments', () => {
		const result = parseEmailDraftApproveFields({
			...validApprovePayload,
			attachments: [
				{
					content: 'aGVsbG8=',
					filename: 'preview.jpg',
					type: 'image/jpeg',
					disposition: 'inline',
					content_id: 'preview-1'
				}
			]
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.attachments?.[0].content_id).toBe('preview-1');
	});

	it('rejects invalid inline image attachments', () => {
		expect(
			parseEmailDraftApproveFields({
				...validApprovePayload,
				attachments: [
					{
						content: 'not base64',
						filename: 'preview.svg',
						type: 'image/svg+xml',
						disposition: 'inline',
						content_id: 'bad cid'
					}
				]
			}).ok
		).toBe(false);
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
