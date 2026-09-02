/**
 * The "Copy instructions for my agent" payload. A user pastes this into Claude Code,
 * Cursor, or any agent that can run shell commands, and the agent performs the
 * integration itself: register the MCP server (or install the skill), verify the
 * token, and send a first delivery.
 *
 * Kept as plain text with no Markdown tables so it reads the same in every chat
 * surface. Shared by the landing page (placeholder token), the getting-started guide,
 * and the account page (real token, right after it is created).
 */

export const DEFAULT_RELAY_URL = 'https://arelay.app';
export const AGENT_TOKEN_PLACEHOLDER = 'ar_...';

export type AgentInstructionsInput = {
	/** A real agent token; omitted or empty renders the placeholder plus a note on where to get one. */
	token?: string | null;
	/** Base URL of the relay. Only mentioned when it differs from the hosted service. */
	relayUrl?: string | null;
};

function normalizeRelayUrl(value: string | null | undefined): string {
	const trimmed = value?.trim().replace(/\/+$/, '');
	return trimmed || DEFAULT_RELAY_URL;
}

export function buildAgentSetupInstructions(input: AgentInstructionsInput = {}): string {
	const token = input.token?.trim() || AGENT_TOKEN_PLACEHOLDER;
	const hasToken = token !== AGENT_TOKEN_PLACEHOLDER;
	const relayUrl = normalizeRelayUrl(input.relayUrl);
	const selfHosted = relayUrl !== DEFAULT_RELAY_URL;
	const mcpEnv = selfHosted
		? `--env ARELAY_TOKEN=${token} --env ARELAY_URL=${relayUrl}`
		: `--env ARELAY_TOKEN=${token}`;
	const mcpJsonEnv = selfHosted
		? `{ "ARELAY_TOKEN": "${token}", "ARELAY_URL": "${relayUrl}" }`
		: `{ "ARELAY_TOKEN": "${token}" }`;
	const shellEnv = selfHosted
		? `ARELAY_TOKEN=${token} ARELAY_URL=${relayUrl}`
		: `ARELAY_TOKEN=${token}`;

	const lines = [
		'Set up Agent Relay so you can deliver finished work to my private inbox and ask me for approval before anything is sent on my behalf.',
		'',
		`Agent Relay (${relayUrl}) is where I review what you produce: reports, files, and outbound email drafts. Everything is end-to-end encrypted with my public key before upload, and nothing is emailed to anyone until I approve it in my inbox.`,
		''
	];
	if (!hasToken) {
		lines.push(
			`The token below is a placeholder. Ask me for a real one — I create it at ${relayUrl}/portal/account under "Agent API tokens" — and substitute it everywhere ${AGENT_TOKEN_PLACEHOLDER} appears.`,
			''
		);
	}
	lines.push(
		'1. Register the MCP server. In Claude Code run:',
		`   claude mcp add arelay ${mcpEnv} -- npx -y @arelay/cli mcp`,
		'   In Cursor or another MCP host, add this to the MCP config instead:',
		`   { "mcpServers": { "arelay": { "command": "npx", "args": ["-y", "@arelay/cli", "mcp"], "env": ${mcpJsonEnv} } } }`,
		'',
		'2. If you cannot register MCP servers, install the agent skill and follow the HTTP API it documents:',
		'   npx skills add mmmikael/arelay-skills --skill agent-relay -g -y',
		`   The skill reads AGENT_RELAY_URL=${relayUrl} and AGENT_API_TOKEN=${token} from the environment.`,
		'',
		'3. Verify the connection and that my encryption setup is complete:',
		`   ${shellEnv} npx -y @arelay/cli check`,
		'',
		'4. Send one small delivery so I can confirm it arrived (pick any existing file in this project):',
		`   ${shellEnv} npx -y @arelay/cli send README.md --title "Agent Relay is connected"`,
		'',
		'From now on: when you finish a report or a deliverable, use the deliver_to_inbox tool (or `arelay send`) instead of pasting it into chat. When you need to email someone, use submit_email_draft; I approve or reject it in my inbox and nothing is sent until then. Treat the token as a secret: never print it in a message and never commit it.'
	);
	return lines.join('\n');
}
