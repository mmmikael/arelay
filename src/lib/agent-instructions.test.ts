import { describe, expect, it } from 'vitest';
import {
	AGENT_TOKEN_PLACEHOLDER,
	buildAgentSetupInstructions,
	DEFAULT_RELAY_URL
} from './agent-instructions';

describe('buildAgentSetupInstructions', () => {
	it('embeds a real token everywhere the agent needs it and drops the placeholder note', () => {
		const text = buildAgentSetupInstructions({ token: 'ar_abc123' });
		expect(text).toContain(
			'claude mcp add arelay --env ARELAY_TOKEN=ar_abc123 -- npx -y @arelay/cli mcp'
		);
		expect(text).toContain('"ARELAY_TOKEN": "ar_abc123"');
		expect(text).toContain('ARELAY_TOKEN=ar_abc123 npx -y @arelay/cli check');
		expect(text).toContain('AGENT_API_TOKEN=ar_abc123');
		expect(text).not.toContain(AGENT_TOKEN_PLACEHOLDER);
		expect(text).not.toContain('placeholder');
	});

	it('uses the placeholder and tells the agent where a real token comes from', () => {
		const text = buildAgentSetupInstructions();
		expect(text).toContain(`ARELAY_TOKEN=${AGENT_TOKEN_PLACEHOLDER}`);
		expect(text).toContain(`${DEFAULT_RELAY_URL}/portal/account`);
		expect(text).toContain('placeholder');
	});

	it('only mentions ARELAY_URL for self-hosted relays', () => {
		expect(buildAgentSetupInstructions({ token: 'ar_x' })).not.toContain('ARELAY_URL=');
		expect(
			buildAgentSetupInstructions({ token: 'ar_x', relayUrl: DEFAULT_RELAY_URL + '/' })
		).not.toContain('ARELAY_URL=');
		const selfHosted = buildAgentSetupInstructions({
			token: 'ar_x',
			relayUrl: 'https://relay.example.com/'
		});
		expect(selfHosted).toContain('--env ARELAY_URL=https://relay.example.com ');
		expect(selfHosted).toContain('"ARELAY_URL": "https://relay.example.com"');
		expect(selfHosted).toContain('AGENT_RELAY_URL=https://relay.example.com');
	});

	it('explains the approval behaviour the agent must follow', () => {
		const text = buildAgentSetupInstructions({ token: 'ar_x' });
		expect(text).toContain('deliver_to_inbox');
		expect(text).toContain('submit_email_draft');
		expect(text).toContain('never commit it');
	});
});
