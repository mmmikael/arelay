import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	parseFromAddress,
	sendViaCloudflare,
	validateCloudflareEmailCredentials
} from './email-send';

describe('parseFromAddress', () => {
	it('parses named addresses', () => {
		expect(parseFromAddress('Agent Relay <no-reply@example.com>')).toEqual({
			email: 'no-reply@example.com',
			name: 'Agent Relay'
		});
	});

	it('parses bare email addresses', () => {
		expect(parseFromAddress('no-reply@example.com')).toEqual({
			email: 'no-reply@example.com'
		});
	});
});

describe('sendViaCloudflare', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sends successfully when Cloudflare returns success', async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			text: async () => JSON.stringify({ success: true })
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			sendViaCloudflare({
				accountId: 'acct-1',
				apiToken: 'token-1',
				to: 'user@example.com',
				cc: ['copy@example.com'],
				bcc: ['archive@example.com'],
				from: { email: 'noreply@yourdomain.com', name: 'Company' },
				subject: 'Hello',
				html: '<p>Hi</p>',
				text: 'Hi',
				attachments: [
					{
						content: 'aGVsbG8=',
						filename: 'preview.jpg',
						type: 'image/jpeg',
						disposition: 'inline',
						content_id: 'preview-1'
					}
				]
			})
		).resolves.toEqual({ success: true });

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-1/email/sending/send');
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toMatchObject({
			to: 'user@example.com',
			cc: ['copy@example.com'],
			bcc: ['archive@example.com'],
			from: { address: 'noreply@yourdomain.com', name: 'Company' },
			subject: 'Hello',
			html: '<p>Hi</p>',
			text: 'Hi',
			attachments: [{ content_id: 'preview-1', disposition: 'inline' }]
		});
	});

	it('logs the Ray ID, draft and user on failure without the token', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				headers: new Headers({ 'cf-ray': '8f1a2b3c4d5e6f70-SJC' }),
				text: async () =>
					JSON.stringify({
						success: false,
						errors: [{ code: 10000, message: 'Authentication error' }]
					})
			})
		);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(
			sendViaCloudflare({
				accountId: 'acct-1',
				apiToken: 'secret-token',
				to: 'user@example.com',
				from: { email: 'noreply@yourdomain.com' },
				subject: 'Hello',
				html: '<p>Hi</p>',
				logContext: { draftId: 'draft-1', userId: 'user-1' }
			})
		).rejects.toThrow('Authentication error');

		const line = String(errorSpy.mock.calls[0]?.[0]);
		expect(line).toContain('status=401 ray=8f1a2b3c4d5e6f70-SJC draft=draft-1 user=user-1');
		expect(line).not.toContain('secret-token');
		errorSpy.mockRestore();
	});

	it('throws with Cloudflare error message on failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
				text: async () => JSON.stringify({ success: false, errors: [{ message: 'Invalid token' }] })
			})
		);

		await expect(
			sendViaCloudflare({
				accountId: 'acct-1',
				apiToken: 'bad',
				to: 'user@example.com',
				from: { email: 'noreply@yourdomain.com' },
				subject: 'Hello',
				html: '<p>Hi</p>'
			})
		).rejects.toThrow('Invalid token');
	});
});

describe('validateCloudflareEmailCredentials', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	function reply(status: number, body: unknown) {
		return { ok: status >= 200 && status < 300, status, json: async () => body };
	}

	const schemaError = reply(400, {
		success: false,
		errors: [{ code: 10001, message: 'email.sending.error.invalid_request_schema' }]
	});
	const authError = reply(401, {
		success: false,
		errors: [{ code: 10000, message: 'Authentication error' }]
	});

	it('accepts an account-owned token without calling /user/tokens/verify', async () => {
		// Account-owned tokens fail /user/tokens/verify with "Invalid API Token" even when valid,
		// which is what blocked a user from re-saving credentials (issue #88).
		const fetchMock = vi.fn().mockResolvedValueOnce(schemaError);
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			validateCloudflareEmailCredentials({ accountId: 'acct-1', apiToken: 'cfat_token' })
		).resolves.toBeUndefined();

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-1/email/sending/send');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cfat_token');
	});

	it('accepts any non-auth 4xx from the probe, since auth is checked first', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(
					reply(400, { success: false, errors: [{ code: 10202, message: 'some.new.wording' }] })
				)
		);

		await expect(
			validateCloudflareEmailCredentials({ accountId: 'acct-1', apiToken: 'token-1' })
		).resolves.toBeUndefined();
	});

	it('normalizes a pasted token and account ID before probing', async () => {
		const fetchMock = vi.fn().mockResolvedValueOnce(schemaError);
		vi.stubGlobal('fetch', fetchMock);

		await validateCloudflareEmailCredentials({
			accountId: ' acct-1 \n',
			apiToken: 'Bearer tok\nen-1 '
		});

		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain('/accounts/acct-1/');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-1');
	});

	it('says the token is not accepted when no verify endpoint knows it', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(authError)
				.mockResolvedValue(
					reply(401, { success: false, errors: [{ code: 1000, message: 'Invalid API Token' }] })
				)
		);

		await expect(
			validateCloudflareEmailCredentials({ accountId: 'acct-1', apiToken: 'bad' })
		).rejects.toThrow('Cloudflare does not accept this API token');
	});

	it('says the token lacks permission when it is active but cannot send', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(authError)
			.mockResolvedValueOnce(reply(200, { success: true, result: { status: 'active' } }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			validateCloudflareEmailCredentials({ accountId: 'acct-1', apiToken: 'token-1' })
		).rejects.toThrow('active but cannot send email for this Account ID');
		expect(fetchMock.mock.calls[1]?.[0]).toBe(
			'https://api.cloudflare.com/client/v4/accounts/acct-1/tokens/verify'
		);
	});

	it('logs the Cloudflare code on rejection without the token', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce(authError)
				.mockResolvedValue(reply(401, { success: false, errors: [{ code: 1000 }] }))
		);

		await expect(
			validateCloudflareEmailCredentials({ accountId: 'acct-1', apiToken: 'secret-token' })
		).rejects.toThrow();

		const line = String(warn.mock.calls[0]?.[0]);
		expect(line).toContain('status=401 code=10000');
		expect(line).toContain('tokenActive=false');
		expect(line).not.toContain('secret-token');
	});

	it('asks to retry when Cloudflare returns a server error', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply(503, null)));

		await expect(
			validateCloudflareEmailCredentials({ accountId: 'acct-1', apiToken: 'token-1' })
		).rejects.toThrow('Try again in a minute');
	});
});
