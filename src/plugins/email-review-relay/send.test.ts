import { describe, expect, it } from 'vitest';
import { prepareEmailDraftSendFields } from './send';

describe('prepareEmailDraftSendFields', () => {
	it('sanitizes html to match portal preview', () => {
		const raw = '<p>Hi</p><script>alert(1)</script>';
		const prepared = prepareEmailDraftSendFields({
			to: 'user@example.com',
			from: { email: 'noreply@yourdomain.com' },
			subject: 'Hello',
			html: raw
		});

		expect(prepared.html).not.toContain('<script');
		expect(prepared.html).toContain('<p>Hi</p>');
		expect(prepared.to).toBe('user@example.com');
	});

	it('preserves cc/bcc through preparation', () => {
		const prepared = prepareEmailDraftSendFields({
			to: 'user@example.com',
			cc: 'a@x.com, b@x.com',
			bcc: 'me@x.com',
			from: { email: 'noreply@yourdomain.com' },
			subject: 'Hello',
			html: '<p>Hi</p>'
		});
		expect(prepared.cc).toBe('a@x.com, b@x.com');
		expect(prepared.bcc).toBe('me@x.com');
	});

	it('wraps plain text html bodies for email clients', () => {
		const prepared = prepareEmailDraftSendFields({
			to: 'user@example.com',
			from: { email: 'noreply@yourdomain.com' },
			subject: 'Hello',
			html: 'Line one\n\nLine two'
		});

		expect(prepared.html).toContain('<!DOCTYPE html>');
		expect(prepared.html).toContain('white-space:pre-wrap');
		expect(prepared.html).toContain('Line one');
		expect(prepared.html).toContain('Line two');
	});
});
