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

	it('preserves CID images and inline attachments', () => {
		const prepared = prepareEmailDraftSendFields({
			to: 'user@example.com',
			from: { email: 'noreply@yourdomain.com' },
			subject: 'Hello',
			html: '<p><img src="cid:arelay-inline-1" alt="Preview"></p>',
			attachments: [
				{
					content: 'aGVsbG8=',
					filename: 'inline-image-1.jpg',
					type: 'image/jpeg',
					disposition: 'inline',
					content_id: 'arelay-inline-1'
				}
			]
		});

		expect(prepared.html).toContain('src="cid:arelay-inline-1"');
		expect(prepared.attachments?.[0].content_id).toBe('arelay-inline-1');
	});
});
