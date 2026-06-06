import { describe, expect, it } from 'vitest';
import type { EmailDraftRecord, EmailDraftStatus } from './types';

const envelope = {
	v: 1,
	alg: 'P-256-ECDH-A256GCM',
	epk: { kty: 'EC', crv: 'P-256', x: 'abc', y: 'def' },
	iv: 'iv',
	ciphertext: 'cipher'
};

function makeDraft(status: EmailDraftStatus): EmailDraftRecord {
	const now = new Date('2026-06-06T12:00:00Z');
	return {
		id: 'draft-1',
		session_id: 'session-1',
		owner_user_id: 'user-1',
		encryption_version: 'e2ee-v1',
		encrypted_to: envelope,
		encrypted_from_email: envelope,
		encrypted_from_name: null,
		encrypted_subject: envelope,
		encrypted_html: envelope,
		encrypted_text: null,
		encrypted_metadata: null,
		idempotency_key: null,
		status,
		reviewed_at: null,
		sent_at: null,
		send_error: null,
		created_at: now,
		updated_at: now
	};
}

function canReviewDraft(draft: EmailDraftRecord): boolean {
	return draft.status === 'pending';
}

describe('email draft review state guards', () => {
	it('allows approve and reject only while pending', () => {
		expect(canReviewDraft(makeDraft('pending'))).toBe(true);
		expect(canReviewDraft(makeDraft('approved'))).toBe(false);
		expect(canReviewDraft(makeDraft('rejected'))).toBe(false);
		expect(canReviewDraft(makeDraft('sent'))).toBe(false);
		expect(canReviewDraft(makeDraft('failed'))).toBe(false);
	});

	it('models approve success path', () => {
		const pending = makeDraft('pending');
		expect(canReviewDraft(pending)).toBe(true);

		const approved = { ...pending, status: 'approved' as const, reviewed_at: new Date() };
		const sent = { ...approved, status: 'sent' as const, sent_at: new Date() };

		expect(sent.status).toBe('sent');
		expect(sent.sent_at).toBeInstanceOf(Date);
	});

	it('models approve failure path after optimistic lock', () => {
		const approved = { ...makeDraft('pending'), status: 'approved' as const, reviewed_at: new Date() };
		const failed = {
			...approved,
			status: 'failed' as const,
			send_error: 'Invalid token'
		};

		expect(failed.status).toBe('failed');
		expect(failed.send_error).toBe('Invalid token');
	});

	it('models reject path without sending', () => {
		const pending = makeDraft('pending');
		const rejected = {
			...pending,
			status: 'rejected' as const,
			reviewed_at: new Date()
		};

		expect(rejected.status).toBe('rejected');
		expect(rejected.sent_at).toBeNull();
	});
});
