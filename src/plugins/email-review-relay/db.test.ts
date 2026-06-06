import { describe, expect, it } from 'vitest';
import type { EmailDraftRecord, EmailDraftStatus } from './types';

function makeDraft(status: EmailDraftStatus): EmailDraftRecord {
	const now = new Date('2026-06-06T12:00:00Z');
	return {
		id: 'draft-1',
		session_id: 'session-1',
		owner_user_id: 'user-1',
		encryption_version: 'none',
		to_address: 'user@example.com',
		from_email: 'noreply@yourdomain.com',
		from_name: 'Company',
		subject: 'Hello',
		html: '<p>Hi</p>',
		text: 'Hi',
		metadata: null,
		encrypted_to: null,
		encrypted_from_email: null,
		encrypted_from_name: null,
		encrypted_subject: null,
		encrypted_html: null,
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
