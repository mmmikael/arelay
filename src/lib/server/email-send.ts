export type EmailFromAddress = {
	email: string;
	name?: string;
};

export type SendEmailInput = {
	accountId: string;
	apiToken: string;
	to: string;
	from: EmailFromAddress;
	subject: string;
	html: string;
	text?: string;
	headers?: Record<string, string>;
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
				from: cloudflareFromField(input.from),
				subject: input.subject,
				text: input.text ?? undefined,
				html: input.html,
				headers: input.headers
			})
		}
	);

	const result = (await response.json().catch(() => null)) as {
		success?: boolean;
		errors?: Array<{ message?: string }>;
	} | null;

	if (!response.ok || !result?.success) {
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

function isCloudflareAuthFailure(status: number, message: string): boolean {
	const normalized = message.toLowerCase();
	return (
		status === 401 ||
		status === 403 ||
		normalized.includes('authentication error') ||
		normalized.includes('unable to authenticate request')
	);
}

export async function validateCloudflareEmailCredentials(input: {
	accountId: string;
	apiToken: string;
}): Promise<void> {
	const accountId = input.accountId.trim();
	const apiToken = input.apiToken.trim();

	const verifyResponse = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
		headers: { Authorization: `Bearer ${apiToken}` }
	});
	const verifyResult = await readCloudflareApiResult(verifyResponse);
	if (!verifyResponse.ok || !verifyResult?.success) {
		throw new Error(
			verifyResult?.errors?.[0]?.message || 'Cloudflare API token is invalid or inactive.'
		);
	}

	// List-domains often requires broader read scopes than send. Probe the send API with an
	// intentionally invalid body: auth failures return 401, while send-capable tokens get
	// a schema validation error instead.
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

	const probeMessage = probeResult?.errors?.[0]?.message ?? '';
	if (probeMessage.includes('invalid_request_schema')) {
		return;
	}

	if (isCloudflareAuthFailure(probeResponse.status, probeMessage)) {
		throw new Error(
			'API token cannot send email for this Account ID. Confirm the Account ID, Email Sending permission on the token, and that the token is scoped to this account.'
		);
	}

	throw new Error(
		probeMessage || `Cloudflare credentials could not be validated (${probeResponse.status})`
	);
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
