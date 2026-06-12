import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { ArelayClient, type DeliverFile } from './client.js';
import { PACKAGE_VERSION } from './version.js';

const fileInput = z
	.object({
		path: z.string().optional().describe('Path to a file on disk to deliver.'),
		filename: z
			.string()
			.optional()
			.describe('Filename shown in the inbox. Required for inline content; defaults to the basename of path.'),
		content: z
			.string()
			.optional()
			.describe('Inline file content (UTF-8 text). Use path for binary files.'),
		content_type: z.string().optional().describe('MIME type; guessed from the filename when omitted.')
	})
	.describe('A file to deliver: either {path} or {filename, content}.');

async function resolveFile(input: z.infer<typeof fileInput>): Promise<DeliverFile> {
	if (input.path) {
		return {
			filename: input.filename ?? basename(input.path),
			content: new Uint8Array(await readFile(input.path)),
			contentType: input.content_type
		};
	}
	if (input.filename && input.content !== undefined) {
		return { filename: input.filename, content: input.content, contentType: input.content_type };
	}
	throw new Error('Each file needs either a path, or a filename plus inline content.');
}

function textResult(value: unknown) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(err: unknown) {
	return {
		content: [{ type: 'text' as const, text: err instanceof Error ? err.message : String(err) }],
		isError: true
	};
}

export async function runMcpServer(env: NodeJS.ProcessEnv = process.env): Promise<void> {
	const server = new McpServer({ name: 'arelay', version: PACKAGE_VERSION });

	// Token problems should surface as tool errors with a fix hint, not crash
	// the server at startup (the host shows startup failures poorly).
	const getClient = (): ArelayClient => ArelayClient.fromEnv(env);

	server.registerTool(
		'deliver_to_inbox',
		{
			title: 'Deliver files to the Agent Relay inbox',
			description:
				'Deliver finished work (reports, files, artifacts) to the human\'s end-to-end encrypted Agent Relay inbox. ' +
				'Creates a new session unless session_id is given. Use this when work is complete and a human should receive the result.',
			inputSchema: {
				title: z.string().describe('Short human-readable title for the delivery session.'),
				summary: z.string().optional().describe('One or two sentences on what was delivered and why.'),
				session_id: z.string().optional().describe('Existing session id to add files to instead of creating a new session.'),
				files: z.array(fileInput).min(1).describe('Files to deliver.')
			}
		},
		async (args) => {
			try {
				const client = getClient();
				const files = await Promise.all(args.files.map(resolveFile));
				const result = await client.deliver({
					title: args.title,
					summary: args.summary,
					sessionId: args.session_id,
					files
				});
				return textResult({
					session_id: result.sessionId,
					portal_url: result.portalUrl,
					delivered: result.artifacts.map((artifact) => artifact.filename),
					note: 'Share the portal_url with the human; they unlock it with their passkey.'
				});
			} catch (err) {
				return errorResult(err);
			}
		}
	);

	server.registerTool(
		'list_inbox_sessions',
		{
			title: 'List inbox sessions',
			description:
				'List delivery sessions in the Agent Relay inbox (ids, timestamps, read state). ' +
				'Titles are end-to-end encrypted and cannot be read by agents.',
			inputSchema: {}
		},
		async () => {
			try {
				const sessions = await getClient().listSessions();
				return textResult(
					sessions.map((session) => ({
						session_id: session.id,
						is_read: session.is_read,
						created_at: session.created_at,
						updated_at: session.updated_at
					}))
				);
			} catch (err) {
				return errorResult(err);
			}
		}
	);

	server.registerTool(
		'submit_email_draft',
		{
			title: 'Submit an email draft for human review',
			description:
				'Submit an outbound email draft to the Agent Relay inbox for human approval before it is sent ' +
				'(requires the Email Review Relay plugin, enabled on arelay.app). Nothing is sent until the human approves.',
			inputSchema: {
				to: z.string().describe('Recipient email address.'),
				from_email: z.string().describe('Sender email address (must be one the account can send from).'),
				from_name: z.string().optional().describe('Sender display name.'),
				subject: z.string().describe('Email subject.'),
				html: z.string().describe('HTML body of the email.'),
				text: z.string().optional().describe('Plain-text body.'),
				idempotency_key: z
					.string()
					.optional()
					.describe('Stable key so retries return the existing draft instead of creating duplicates.')
			}
		},
		async (args) => {
			try {
				const result = await getClient().createEmailDraft({
					to: args.to,
					fromEmail: args.from_email,
					fromName: args.from_name,
					subject: args.subject,
					html: args.html,
					text: args.text,
					sessionSummary: `To: ${args.to}`,
					idempotencyKey: args.idempotency_key
				});
				return textResult({
					session_id: result.sessionId,
					portal_url: result.portalUrl,
					draft_id: result.draft.id,
					status: result.draft.status,
					note: 'The email is NOT sent yet — the human must approve it in the portal.'
				});
			} catch (err) {
				return errorResult(err);
			}
		}
	);

	await server.connect(new StdioServerTransport());
}
