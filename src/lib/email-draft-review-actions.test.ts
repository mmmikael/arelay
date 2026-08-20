import { describe, expect, it, vi } from 'vitest';
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

	it('turns embedded images into CID attachments before sanitizing', () => {
		const sent = buildSentEmailBundle(
			agentBundle,
			'<p><img src="data:image/jpeg;base64,aGVsbG8=" alt="Preview"></p>'
		);

		expect(sent.html).toContain('src="cid:arelay-inline-1"');
		expect(sent.attachments).toHaveLength(1);
		expect(sent.attachments?.[0]).toMatchObject({
			content: 'aGVsbG8=',
			type: 'image/jpeg',
			disposition: 'inline',
			content_id: 'arelay-inline-1'
		});
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

	it('includes inline attachments in the approve request', async () => {
		const init = await buildApproveRequestInit({
			sentBundle: {
				...agentBundle,
				attachments: [
					{
						content: 'aGVsbG8=',
						filename: 'inline-image-1.jpg',
						type: 'image/jpeg',
						disposition: 'inline',
						content_id: 'arelay-inline-1'
					}
				]
			},
			encryptionVersion: 'e2ee-v1',
			publicKeyJwk: null,
			encryptString: vi.fn()
		});

		expect(JSON.parse(String(init.body))).toMatchObject({
			attachments: [{ content_id: 'arelay-inline-1', disposition: 'inline' }]
		});
	});
});
