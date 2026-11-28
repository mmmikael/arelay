export type EmailFromAddress = {
	email: string;
	name?: string;
};

export type SendEmailInput = {
	accountId: string;
	apiToken: string;
	to: string;
	cc?: string[];
	bcc?: string[];
	from: EmailFromAddress;
	subject: string;
	html: string;
	text?: string;
	attachments?: Array<{
		content: string;
		filename: string;
		type: string;
		disposition: 'inline' | 'attachment';
		content_id?: string;
	}>;
	headers?: Record<string, string>;
	/** Identifiers added to the failure log line so a send can be traced later. */
	logContext?: { draftId?: string; userId?: string };
};

export type CloudflareSendResult = {
	success: boolean;
};

function cloudflareFromField(from: EmailFromAddress): { address: string; name?: string } | string {
	return from.name ? { address: from.email, name: from.name } : from.email;
}

export async function sendViaCloudflare(input: SendEmailInput): Promise<CloudflareSendResult> {
	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${input.accountId.trim()}/email/sending/send`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${input.apiToken.trim()}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				to: input.to,
				cc: input.cc?.length ? input.cc : undefined,
				bcc: input.bcc?.length ? input.bcc : undefined,
				from: cloudflareFromField(input.from),
				subject: input.subject,
				text: input.text ?? undefined,
				html: input.html,
				attachments: input.attachments?.length ? input.attachments : undefined,
				headers: input.headers
			})
		}
	);

	const rawBody = await response.text();
	let result: { success?: boolean; errors?: Array<{ message?: string }> } | null = null;
	try {
		result = rawBody ? JSON.parse(rawBody) : null;
	} catch {
		result = null;
	}

	if (!response.ok || !result?.success) {
		// Log the raw Cloudflare response so send failures are diagnosable (the
		// caller turns this into an error the reviewer can see; never logs the token).
		const rayId = response.headers?.get?.('cf-ray') ?? 'none';
		const draftId = input.logContext?.draftId ?? 'unknown';
		const userId = input.logContext?.userId ?? 'unknown';
		console.error(
			`[email-send] Cloudflare send failed: status=${response.status} ray=${rayId} draft=${draftId} user=${userId} body=${rawBody.slice(0, 2000)}`
		);
		const message =
			result?.errors?.[0]?.message || `Cloudflare email send failed (${response.status})`;
		throw new Error(message);
	}

	return { success: true };
}

type CloudflareApiResult = {
	success?: boolean;
	errors?: Array<{ code?: number; message?: string }>;
};

async function readCloudflareApiResult(response: Response): Promise<CloudflareApiResult | null> {
	return (await response.json().catch(() => null)) as CloudflareApiResult | null;
}

/** Cloudflare's generic "this token can't do that here" code (bad, expired or unscoped token). */
const CLOUDFLARE_AUTH_ERROR_CODE = 10000;
/** Cloudflare rejected the Authorization header itself (stray characters in the token). */
const CLOUDFLARE_BAD_HEADER_CODES = new Set([6003, 6111]);

function isCloudflareAuthFailure(status: number, result: CloudflareApiResult | null): boolean {
	const first = result?.errors?.[0];
	const message = (first?.message ?? '').toLowerCase();
	return (
		status === 401 ||
		first?.code === CLOUDFLARE_AUTH_ERROR_CODE ||
		message.includes('authentication error') ||
		message.includes('unable to authenticate request')
	);
}

/**
 * Normalize a pasted token: drop a copied "Bearer " prefix and any whitespace or line breaks
 * (Cloudflare tokens never contain whitespace).
 */
export function normalizeCloudflareApiToken(value: string): string {
	return value
		.trim()
		.replace(/^bearer\s+/i, '')
		.replace(/\s+/g, '');
}

export function normalizeCloudflareAccountId(value: string): string {
	return value.replace(/\s+/g, '');
}

/** Ask Cloudflare whether the token itself is active, trying account-owned then user-owned. */
async function isCloudflareTokenActive(accountId: string, apiToken: string): Promise<boolean> {
	const urls = [
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`,
		'https://api.cloudflare.com/client/v4/user/tokens/verify'
	];
	for (const url of urls) {
		try {
			const response = await fetch(url, { headers: { Authorization: `Bearer ${apiToken}` } });
			const result = await readCloudflareApiResult(response);
			if (response.ok && result?.success) return true;
		} catch {
			// Diagnostic only; fall through to the next endpoint.
		}
	}
	return false;
}

function cloudflareErrorSummary(status: number, result: CloudflareApiResult | null): string {
	const first = result?.errors?.[0];
	return `status=${status} code=${first?.code ?? 'none'} message=${first?.message ?? 'none'}`;
}

/**
 * Check that the token can call the Email Sending API for this account.
 *
 * The send endpoint itself is the test: Cloudflare checks auth before it validates the body,
 * so an empty body gets an auth error (code 10000) for a token that can't send here, and a
 * body-validation error for one that can. We don't gate on /user/tokens/verify, because it
 * rejects valid account-owned tokens; the verify endpoints are only used to explain a failure.
 */
export async function validateCloudflareEmailCredentials(input: {
	accountId: string;
	apiToken: string;
}): Promise<void> {
	const accountId = normalizeCloudflareAccountId(input.accountId);
	const apiToken = normalizeCloudflareApiToken(input.apiToken);

	const probeResponse = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json'
			},
			body: '{}'
		}
	);
	const probeResult = await readCloudflareApiResult(probeResponse);
	if (probeResult?.success) {
		return;
	}

	const summary = cloudflareErrorSummary(probeResponse.status, probeResult);
	const firstCode = probeResult?.errors?.[0]?.code;

	if (firstCode !== undefined && CLOUDFLARE_BAD_HEADER_CODES.has(firstCode)) {
		console.warn(`[email-send] credential check rejected: ${summary}`);
		throw new Error(
			'Cloudflare could not read this API token. Copy the token value again, without extra characters, and save it.'
		);
	}

	if (isCloudflareAuthFailure(probeResponse.status, probeResult)) {
		const tokenActive = await isCloudflareTokenActive(accountId, apiToken);
		console.warn(`[email-send] credential check rejected: ${summary} tokenActive=${tokenActive}`);
		throw new Error(
			tokenActive
				? 'This API token is active but cannot send email for this Account ID. Check that the token has the Email Sending permission and is scoped to this account, and that the Account ID is correct.'
				: 'Cloudflare does not accept this API token. It may be mistyped, expired or revoked. Create a new token with the Email Sending permission and save it here.'
		);
	}

	if (probeResponse.status >= 500 || !probeResult) {
		console.warn(`[email-send] credential check could not reach Cloudflare: ${summary}`);
		throw new Error(
			`Cloudflare could not be reached to check these credentials (${probeResponse.status}). Try again in a minute.`
		);
	}

	// Any other 4xx means Cloudflare got past auth and objected to the empty probe body,
	// so the token can send for this account.
	const message = probeResult.errors?.[0]?.message ?? '';
	if (!message.includes('invalid_request_schema')) {
		console.warn(`[email-send] credential check accepted on unexpected probe reply: ${summary}`);
	}
}

export function parseFromAddress(value: string): EmailFromAddress {
	const trimmed = value.trim();
	const namedMatch = /^(.+?)\s*<([^>]+)>$/.exec(trimmed);
	if (namedMatch) {
		const name = namedMatch[1].trim().replace(/^["']|["']$/g, '');
		const address = namedMatch[2].trim();
		return { email: address, name: name || undefined };
	}

	return { email: trimmed };
}
