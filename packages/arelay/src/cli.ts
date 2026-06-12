#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import { ArelayClient, type DeliverFile } from './client.js';
import { runMcpServer } from './mcp.js';
import { PACKAGE_VERSION } from './version.js';

const USAGE = `arelay — deliver encrypted files from agents to an Agent Relay inbox

Usage:
  arelay send <file...> [--title <title>] [--summary <text>] [--session <id>]
  arelay check
  arelay mcp

Commands:
  send     Encrypt and deliver files to the inbox (creates a session unless --session is given)
  check    Verify the token and encryption setup, then print account status
  mcp      Run the MCP server on stdio (for Claude Code, Cursor, and other MCP hosts)

Options:
  --title <title>     Session title (defaults to the filenames)
  --summary <text>    Session summary shown under the title
  --session <id>      Add files to an existing session instead of creating one
  --url <url>         Relay base URL (default: $ARELAY_URL or https://arelay.app)
  --token <token>     Agent API token (default: $ARELAY_TOKEN)
  --version           Print the version
  --help              Show this help

Environment:
  ARELAY_TOKEN        Agent API token (create one in the portal under Account)
  ARELAY_URL          Relay base URL for self-hosted deployments

Examples:
  arelay send report.md --title "Q2 revenue report"
  arelay send build/report.pdf metrics.csv --title "Nightly metrics" --summary "All checks green"
  claude mcp add arelay --env ARELAY_TOKEN=ar_... -- npx -y @arelay/cli mcp
`;

function fail(message: string): never {
	console.error(`Error: ${message}`);
	process.exit(1);
}

function clientFromFlags(values: { url?: string; token?: string }): ArelayClient {
	const token = values.token ?? process.env.ARELAY_TOKEN ?? process.env.AGENT_API_TOKEN;
	if (!token) {
		fail('No agent API token. Set ARELAY_TOKEN (portal → Account → Agent API tokens) or pass --token.');
	}
	return new ArelayClient({
		token,
		baseUrl: values.url ?? process.env.ARELAY_URL ?? process.env.AGENT_RELAY_URL ?? undefined
	});
}

async function commandSend(args: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: {
			title: { type: 'string' },
			summary: { type: 'string' },
			session: { type: 'string' },
			'content-type': { type: 'string' },
			url: { type: 'string' },
			token: { type: 'string' }
		}
	});

	if (positionals.length === 0) {
		fail('No files to send. Usage: arelay send <file...> --title "..."');
	}

	const files: DeliverFile[] = await Promise.all(
		positionals.map(async (path) => {
			const content = new Uint8Array(
				await readFile(path).catch(() => fail(`Could not read file: ${path}`))
			);
			return { filename: basename(path), content, contentType: values['content-type'] };
		})
	);

	const client = clientFromFlags(values);
	const result = await client.deliver({
		title: values.title ?? files.map((file) => file.filename).join(', ').slice(0, 120),
		summary: values.summary,
		sessionId: values.session,
		files
	});

	console.log(
		JSON.stringify(
			{
				session_id: result.sessionId,
				portal_url: result.portalUrl,
				delivered: result.artifacts.map((artifact) => artifact.filename)
			},
			null,
			2
		)
	);
}

async function commandCheck(args: string[]): Promise<void> {
	const { values } = parseArgs({
		args,
		options: { url: { type: 'string' }, token: { type: 'string' } }
	});
	const client = clientFromFlags(values);
	const config = await client.getE2eeConfig();
	const sessions = await client.listSessions();
	console.log(
		JSON.stringify(
			{
				relay: client.baseUrl,
				token: 'valid',
				e2ee_configured: config.configured,
				sessions: sessions.length
			},
			null,
			2
		)
	);
	if (!config.configured) {
		console.error('Encryption is not set up yet: open the portal once and complete setup.');
		process.exit(2);
	}
}

async function main(): Promise<void> {
	const [command, ...rest] = process.argv.slice(2);

	if (!command || command === 'help' || command === '--help' || command === '-h') {
		console.log(USAGE);
		return;
	}
	if (command === '--version' || command === '-v' || command === 'version') {
		console.log(PACKAGE_VERSION);
		return;
	}

	switch (command) {
		case 'send':
			await commandSend(rest);
			break;
		case 'check':
			await commandCheck(rest);
			break;
		case 'mcp':
			await runMcpServer();
			break;
		default:
			console.error(`Unknown command: ${command}\n`);
			console.log(USAGE);
			process.exit(1);
	}
}

main().catch((err) => {
	fail(err instanceof Error ? err.message : String(err));
});
