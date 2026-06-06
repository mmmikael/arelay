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
});
