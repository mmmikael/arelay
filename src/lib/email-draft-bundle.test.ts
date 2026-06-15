import { describe, expect, it } from 'vitest';
import {
	agentFieldsToBundle,
	bundleMatchesAgent,
	emailDraftDisplayBundle,
	mergeEmailDraftBundle,
	parseEmailDraftBundleJson
} from './email-draft-bundle';

const agent = {
	to: 'user@example.com',
	cc: null,
	bcc: null,
	from_email: 'noreply@example.com',
	from_name: 'Relay',
	subject: 'Hi',
	html: '<p>agent</p>'
};

describe('emailDraftBundle', () => {
	it('merges partial review over agent fields', () => {
		expect(
			mergeEmailDraftBundle(agent, { subject: 'Updated', html: '<p>review</p>' })
		).toEqual({
			...agentFieldsToBundle(agent),
			subject: 'Updated',
			html: '<p>review</p>'
		});
	});

	it('picks sent bundle after send', () => {
		expect(
			emailDraftDisplayBundle(
				agent,
				{ subject: 'Review' },
				{ subject: 'Sent', html: '<p>sent</p>' },
				'sent'
			).subject
		).toBe('Sent');
	});

	it('parses bundle JSON', () => {
		const bundle = agentFieldsToBundle(agent);
		expect(parseEmailDraftBundleJson(JSON.stringify(bundle))).toEqual(bundle);
	});

	it('detects unchanged bundle', () => {
		expect(bundleMatchesAgent(agentFieldsToBundle(agent), agent)).toBe(true);
	});

	it('round-trips and merges cc/bcc', () => {
		const withCc = { ...agent, cc: 'a@x.com, b@x.com', bcc: 'me@x.com' };
		const bundle = agentFieldsToBundle(withCc);
		expect(parseEmailDraftBundleJson(JSON.stringify(bundle))).toEqual(bundle);
		// editing bcc is detected as a change
		expect(bundleMatchesAgent({ ...bundle, bcc: 'other@x.com' }, withCc)).toBe(false);
		// overlay can clear cc back to null
		expect(mergeEmailDraftBundle(withCc, { cc: null }).cc).toBeNull();
	});
});
