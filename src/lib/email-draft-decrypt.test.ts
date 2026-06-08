import { describe, expect, it } from 'vitest';
import {
	emailDraftDisplayFields,
	emailDraftDisplayHtml,
	type DecryptedEmailDraftFields
} from './email-draft-decrypt';

const fields: DecryptedEmailDraftFields = {
	to: 'user@example.com',
	from_email: 'noreply@example.com',
	from_name: null,
	subject: 'Hi',
	html: '<p>agent</p>',
	text: null,
	review: { html: '<p>review</p>', subject: 'Review subject' },
	sent: { html: '<p>sent</p>', subject: 'Sent subject' }
};

describe('emailDraftDisplayFields', () => {
	it('prefers review fields while pending', () => {
		expect(emailDraftDisplayFields(fields, 'pending')).toEqual({
			to: 'user@example.com',
			from_email: 'noreply@example.com',
			from_name: null,
			subject: 'Review subject',
			html: '<p>review</p>'
		});
	});

	it('prefers sent fields after send', () => {
		expect(emailDraftDisplayFields(fields, 'sent').subject).toBe('Sent subject');
		expect(emailDraftDisplayFields(fields, 'sent').html).toBe('<p>sent</p>');
	});

	it('falls back to agent fields', () => {
		expect(
			emailDraftDisplayFields({ ...fields, review: null, sent: null }, 'pending').html
		).toBe('<p>agent</p>');
	});
});

describe('emailDraftDisplayHtml', () => {
	it('returns display html from bundle', () => {
		expect(emailDraftDisplayHtml(fields, 'pending')).toBe('<p>review</p>');
	});
});
