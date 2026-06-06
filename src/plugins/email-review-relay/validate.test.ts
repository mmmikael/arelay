import { describe, expect, it } from 'vitest';
import {
	isEncryptedEnvelope,
	parseEmailDraftBody,
	parseEmailDraftPayload,
	parseEmailDraftSendFields
} from './validate';

const envelope = {
	v: 1,
	alg: 'P-256-ECDH-A256GCM',
	epk: { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' },
	iv: 'iv',
	ciphertext: 'cipher'
};

const validPayload = {
	to: 'user@example.com',
	from: { email: 'noreply@yourdomain.com', name: 'Your Company' },
	subject: 'Hello',
	html: '<p>Hi</p>',
	text: 'Hi',
	metadata: { campaign: 'welcome' },
	idempotency_key: 'draft-1'
};

describe('parseEmailDraftPayload', () => {
	it('accepts a valid payload', () => {
		const result = parseEmailDraftPayload(validPayload);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value).toEqual({
			to: 'user@example.com',
			from: { email: 'noreply@yourdomain.com', name: 'Your Company' },
			subject: 'Hello',
			html: '<p>Hi</p>',
			text: 'Hi',
			metadata: { campaign: 'welcome' },
			idempotency_key: 'draft-1'
		});
	});

	it('rejects invalid email addresses', () => {
		expect(parseEmailDraftPayload({ ...validPayload, to: 'not-an-email' }).ok).toBe(false);
		expect(parseEmailDraftPayload({ ...validPayload, from: { email: 'bad' } }).ok).toBe(false);
	});

	it('requires subject and html', () => {
		expect(parseEmailDraftPayload({ ...validPayload, subject: '  ' }).ok).toBe(false);
		expect(parseEmailDraftPayload({ ...validPayload, html: '' }).ok).toBe(false);
	});

	it('rejects oversized subject and html', () => {
		expect(
			parseEmailDraftPayload({ ...validPayload, subject: 'x'.repeat(501) }).ok
		).toBe(false);
		expect(parseEmailDraftPayload({ ...validPayload, html: 'x'.repeat(256 * 1024 + 1) }).ok).toBe(
			false
		);
	});

	it('rejects invalid metadata and idempotency_key', () => {
		expect(parseEmailDraftPayload({ ...validPayload, metadata: [] }).ok).toBe(false);
		expect(parseEmailDraftPayload({ ...validPayload, idempotency_key: '  ' }).ok).toBe(false);
	});
});

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
		if (!result.ok) return;
		expect(result.encrypted).toBe(true);
	});

	it('routes plaintext payloads through parseEmailDraftPayload', () => {
		const result = parseEmailDraftBody(validPayload);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.encrypted).toBe(false);
	});
});

describe('parseEmailDraftSendFields', () => {
	it('validates decrypted approve payloads', () => {
		const result = parseEmailDraftSendFields({
			to: 'user@example.com',
			from: { email: 'noreply@yourdomain.com', name: 'Co' },
			subject: 'Hello',
			html: '<p>Hi</p>'
		});
		expect(result.ok).toBe(true);
	});
});
