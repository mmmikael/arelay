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

	it('defaults missing recipient lists for older bundles', () => {
		expect(parseEmailDraftBundleJson(JSON.stringify(agent))).toEqual({
			...agent,
			cc: [],
			bcc: []
		});
	});

	it('preserves cc and bcc recipients', () => {
		const bundle = agentFieldsToBundle({
			...agent,
			cc: ['copy@example.com'],
			bcc: ['archive@example.com']
		});
		expect(parseEmailDraftBundleJson(JSON.stringify(bundle))).toEqual(bundle);
	});

	it('detects unchanged bundle', () => {
		expect(bundleMatchesAgent(agentFieldsToBundle(agent), agent)).toBe(true);
	});
});
