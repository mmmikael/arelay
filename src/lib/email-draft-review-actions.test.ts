import { describe, expect, it, vi, beforeEach } from 'vitest';
import { bundleMatchesAgent, type EmailDraftBundle } from '$lib/email-draft-bundle';
import {
	buildApproveRequestInit,
	buildEditableBundle,
	buildSentEmailBundle,
	parseRecipientInput,
	reviewPayloadNeeded
} from '$lib/email-draft-review-actions';

const agentBundle: EmailDraftBundle = {
	to: 'user@example.com',
	cc: [],
	bcc: [],
	from_email: 'agent@example.com',
	from_name: 'Agent',
	subject: 'Hello',
	html: '<p>Hi</p>'
};

describe('email-draft-review-actions', () => {
	it('buildEditableBundle trims envelope fields', () => {
		expect(
			buildEditableBundle({
				to: ' user@example.com ',
				cc: ' copy@example.com; second@example.com ',
				bcc: ' archive@example.com ',
				from_email: ' agent@example.com ',
				from_name: ' Agent ',
				subject: ' Hello ',
				html: '<p>Hi</p>'
			})
		).toEqual({
			...agentBundle,
			cc: ['copy@example.com', 'second@example.com'],
			bcc: ['archive@example.com']
		});
	});

	it('parses comma and semicolon separated recipients', () => {
		expect(parseRecipientInput('one@example.com, two@example.com; three@example.com')).toEqual([
			'one@example.com',
			'two@example.com',
			'three@example.com'
		]);
	});

	it('reviewPayloadNeeded returns null when unchanged', () => {
		expect(reviewPayloadNeeded(agentBundle, agentBundle, bundleMatchesAgent)).toBeNull();
	});

	it('buildSentEmailBundle sanitizes html for send', () => {
		const sent = buildSentEmailBundle(agentBundle, '<script>alert(1)</script><p>Hi</p>');
		expect(sent.html).not.toContain('<script');
		expect(sent.html).toContain('<p>Hi</p>');
	});

	it('includes optional recipient lists in the approve request', async () => {
		const init = await buildApproveRequestInit({
			sentBundle: {
				...agentBundle,
				cc: ['copy@example.com'],
				bcc: ['archive@example.com']
			},
			encryptionVersion: 'e2ee-v1',
			publicKeyJwk: null,
			encryptString: vi.fn()
		});

		expect(JSON.parse(String(init.body))).toMatchObject({
			to: 'user@example.com',
			cc: ['copy@example.com'],
			bcc: ['archive@example.com']
		});
	});
});
