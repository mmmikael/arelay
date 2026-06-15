import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseFromAddress, sendViaCloudflare, validateCloudflareEmailCredentials } from './email-send';

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
			json: async () => ({ success: true })
		});
		vi.stubGlobal('fetch', fetchMock);

		await expect(
			sendViaCloudflare({
				accountId: 'acct-1',
				apiToken: 'token-1',
				to: 'user@example.com',
				from: { email: 'noreply@yourdomain.com', name: 'Company' },
				subject: 'Hello',
				html: '<p>Hi</p>',
				text: 'Hi'
			})
		).resolves.toEqual({ success: true });

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acct-1/email/sending/send');
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toMatchObject({
			to: 'user@example.com',
			from: { address: 'noreply@yourdomain.com', name: 'Company' },
			subject: 'Hello',
			html: '<p>Hi</p>',
			text: 'Hi'
		});
	});

	it('includes cc/bcc arrays when provided and omits them when empty', async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
		vi.stubGlobal('fetch', fetchMock);

		await sendViaCloudflare({
			accountId: 'acct-1',
			apiToken: 'token-1',
			to: 'user@example.com',
			cc: ['a@x.com', 'b@x.com'],
			bcc: ['me@x.com'],
			from: { email: 'noreply@yourdomain.com' },
			subject: 'Hello',
			html: '<p>Hi</p>'
		});
		const withList = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
		expect(withList.cc).toEqual(['a@x.com', 'b@x.com']);
		expect(withList.bcc).toEqual(['me@x.com']);

		await sendViaCloudflare({
			accountId: 'acct-1',
			apiToken: 'token-1',
			to: 'user@example.com',
			cc: [],
			from: { email: 'noreply@yourdomain.com' },
			subject: 'Hello',
			html: '<p>Hi</p>'
		});
		const empty = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
		expect('cc' in empty).toBe(false);
		expect('bcc' in empty).toBe(false);
	});

	it('throws with Cloudflare error message on failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
				json: async () => ({ success: false, errors: [{ message: 'Invalid token' }] })
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
	});

	it('passes when token verify and send probe succeed', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ success: true })
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 400,
					json: async () => ({
						success: false,
						errors: [{ message: 'email.sending.error.invalid_request_schema' }]
					})
				})
		);

		await expect(
			validateCloudflareEmailCredentials({ accountId: 'acct-1', apiToken: 'token-1' })
		).resolves.toBeUndefined();
	});

	it('throws when token verify fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				json: async () => ({ success: false, errors: [{ message: 'Invalid token' }] })
			})
		);

		await expect(
			validateCloudflareEmailCredentials({ accountId: 'acct-1', apiToken: 'bad' })
		).rejects.toThrow('Invalid token');
	});

	it('throws when send probe is unauthorized', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ success: true })
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 401,
					json: async () => ({ success: false, errors: [{ message: 'Authentication error' }] })
				})
		);

		await expect(
			validateCloudflareEmailCredentials({ accountId: 'acct-1', apiToken: 'token-1' })
		).rejects.toThrow('API token cannot send email for this Account ID');
	});
});
