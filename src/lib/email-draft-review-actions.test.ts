import { describe, expect, it, vi, beforeEach } from 'vitest';
import { bundleMatchesAgent, type EmailDraftBundle } from '$lib/email-draft-bundle';
import {
	buildEditableBundle,
	buildSentEmailBundle,
	reviewPayloadNeeded
} from '$lib/email-draft-review-actions';

const agentBundle: EmailDraftBundle = {
	to: 'user@example.com',
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
				from_email: ' agent@example.com ',
				from_name: ' Agent ',
				subject: ' Hello ',
				html: '<p>Hi</p>'
			})
		).toEqual(agentBundle);
	});

	it('reviewPayloadNeeded returns null when unchanged', () => {
		expect(reviewPayloadNeeded(agentBundle, agentBundle, bundleMatchesAgent)).toBeNull();
	});

	it('buildSentEmailBundle sanitizes html for send', () => {
		const sent = buildSentEmailBundle(agentBundle, '<script>alert(1)</script><p>Hi</p>');
		expect(sent.html).not.toContain('<script');
		expect(sent.html).toContain('<p>Hi</p>');
	});
});
