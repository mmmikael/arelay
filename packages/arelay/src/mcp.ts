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

const inlineImageInput = z
	.object({
		cid: z
			.string()
			.describe('Identifier referenced in html as <img src="cid:CID">; replaced with the image.'),
		path: z.string().describe('Path to an image file on disk to inline (png, jpg, gif, or webp).')
	})
	.describe('An on-disk image to inline into the html body.');

const INLINE_IMAGE_MIME: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp'
};

// Mirrors the relay's inline-attachment limits (email-review-relay validate.ts) so
// oversized images fail here with an actionable message instead of a server 400.
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_INLINE_IMAGES_TOTAL_BYTES = 10 * 1024 * 1024;

function formatMb(bytes: number): string {
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Inline on-disk images into the html by replacing each `cid:<cid>` reference with
 * a base64 data URI read from disk. The Email Review Relay send pipeline converts
 * those data URIs back into proper CID inline attachments (see
 * extractInlineDataImages), so the caller passes a file path instead of embedding
 * hundreds of kilobytes of base64 in the tool call.
 */
export async function applyInlineImages(
	html: string,
	images: Array<z.infer<typeof inlineImageInput>> | undefined
): Promise<string> {
	if (!images?.length) return html;
	let result = html;
	let totalBytes = 0;
	for (const image of images) {
		const extension = image.path.split('.').pop()?.toLowerCase() ?? '';
		const mime = INLINE_IMAGE_MIME[extension];
		if (!mime) {
			throw new Error(`Unsupported inline image type ".${extension}" for cid "${image.cid}".`);
		}
		const bytes = await readFile(image.path);
		if (bytes.length > MAX_INLINE_IMAGE_BYTES) {
			throw new Error(
				`Inline image "${image.path}" is ${formatMb(bytes.length)}; the relay accepts at most ` +
					`${formatMb(MAX_INLINE_IMAGE_BYTES)} per image. Compress or resize it and retry.`
			);
		}
		totalBytes += bytes.length;
		if (totalBytes > MAX_INLINE_IMAGES_TOTAL_BYTES) {
			throw new Error(
				`Inline images total more than ${formatMb(MAX_INLINE_IMAGES_TOTAL_BYTES)} combined ` +
					`(${formatMb(totalBytes)} so far at "${image.path}"). Reduce image size or count and retry.`
			);
		}
		const base64 = Buffer.from(bytes).toString('base64');
		result = result.split(`cid:${image.cid}`).join(`data:${mime};base64,${base64}`);
	}
	return result;
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
				cc: z.string().optional().describe('CC email address.'),
				bcc: z.string().optional().describe('BCC email address (e.g. to keep a copy for the sender).'),
				from_email: z.string().describe('Sender email address (must be one the account can send from).'),
				from_name: z.string().optional().describe('Sender display name.'),
				subject: z.string().describe('Email subject.'),
				html: z.string().describe('HTML body of the email.'),
				text: z.string().optional().describe('Plain-text body.'),
				idempotency_key: z
					.string()
					.optional()
					.describe('Stable key so retries return the existing draft instead of creating duplicates.'),
				inline_images: z
					.array(inlineImageInput)
					.optional()
					.describe(
						'On-disk images to inline into the html body. Each replaces a <img src="cid:CID"> ' +
							'reference with its base64 data URI (delivered as a CID inline attachment), so you ' +
							'pass a file path instead of embedding base64 in this call.'
					)
			}
		},
		async (args) => {
			try {
				const html = await applyInlineImages(args.html, args.inline_images);
				const result = await getClient().createEmailDraft({
					to: args.to,
					cc: args.cc,
					bcc: args.bcc,
					fromEmail: args.from_email,
					fromName: args.from_name,
					subject: args.subject,
					html,
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

	server.registerTool(
		'submit_spend_request',
		{
			title: 'Submit a spend request for human approval',
			description:
				'Propose a payment or purchase to the human\'s Agent Relay inbox for approval before any money moves ' +
				'(requires the Spend Review Relay plugin). Nothing is charged until the human approves; on approval a ' +
				'Stripe PaymentIntent is created in the account\'s Stripe (test) mode. Use this whenever an autonomous ' +
				'action would spend money.',
			inputSchema: {
				payee: z
					.string()
					.describe('Who is being paid or what is being purchased, e.g. "OpenAI API credits".'),
				amount_minor: z
					.number()
					.int()
					.positive()
					.describe('Amount in the smallest currency unit (cents for USD). $49.00 = 4900.'),
				currency: z.string().describe('Three-letter ISO currency code, e.g. "usd".'),
				description: z
					.string()
					.describe('Why this spend is needed — shown to the human reviewer.'),
				idempotency_key: z
					.string()
					.optional()
					.describe('Stable key so retries return the existing request instead of duplicating.')
			}
		},
		async (args) => {
			try {
				const formatted = `${args.currency.toUpperCase()} ${(args.amount_minor / 100).toFixed(2)}`;
				const result = await getClient().createSpendRequest({
					payee: args.payee,
					amountMinor: args.amount_minor,
					currency: args.currency,
					description: args.description,
					sessionSummary: `${args.payee} — ${formatted}`,
					idempotencyKey: args.idempotency_key
				});
				return textResult({
					session_id: result.sessionId,
					portal_url: result.portalUrl,
					request_id: result.request.id,
					status: result.request.status,
					note: 'NOT charged yet — the human must approve it in the portal before any money moves.'
				});
			} catch (err) {
				return errorResult(err);
			}
		}
	);

	await server.connect(new StdioServerTransport());
}
