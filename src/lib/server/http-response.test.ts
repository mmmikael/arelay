import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import {
	applySecurityHeaders,
	hookJsonError,
	type RequestContext
} from './http-response';

const log = pino({ level: 'silent' });
const ctx: RequestContext = { requestId: 'req-test-1', isHttps: false, log };

describe('applySecurityHeaders', () => {
	it('sets x-request-id and security headers', () => {
		const response = applySecurityHeaders(new Response(null, { status: 200 }), ctx);
		expect(response.headers.get('x-request-id')).toBe('req-test-1');
		expect(response.headers.get('x-frame-options')).toBe('DENY');
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	});
});

describe('hookJsonError', () => {
	it('returns JSON error with requestId and security headers', async () => {
		const response = hookJsonError(ctx, 503, 'Service unavailable.');
		expect(response.status).toBe(503);
		expect(response.headers.get('x-request-id')).toBe('req-test-1');
		await expect(response.json()).resolves.toEqual({
			error: 'Service unavailable.',
			requestId: 'req-test-1'
		});
	});
});

describe('publicErrorMessage', () => {
	it('sanitizes internal errors when not in dev', async () => {
		vi.resetModules();
		vi.doMock('$app/environment', () => ({ dev: false }));
		const { publicErrorMessage, PUBLIC_SERVICE_UNAVAILABLE } = await import('./http-response');
		expect(publicErrorMessage('Database migrations have not been applied.')).toBe(
			PUBLIC_SERVICE_UNAVAILABLE
		);
		vi.doUnmock('$app/environment');
		vi.resetModules();
	});
});
