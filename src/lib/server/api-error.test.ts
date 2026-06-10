import { describe, expect, it, vi } from 'vitest';
import { jsonError, logAndJsonError, routeRateLimitResponse } from './api-error';

const log = {
	warn: vi.fn()
};

describe('jsonError', () => {
	it('returns structured error body with request id', async () => {
		const response = jsonError(400, 'Bad request', { requestId: 'req-1' });
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			error: 'Bad request',
			requestId: 'req-1'
		});
	});

	it('includes retryAfterSeconds for rate limits', async () => {
		const response = jsonError(429, 'Too many requests', {
			requestId: 'req-2',
			retryAfterSeconds: 30
		});
		await expect(response.json()).resolves.toEqual({
			error: 'Too many requests',
			requestId: 'req-2',
			retryAfterSeconds: 30
		});
	});
});

describe('logAndJsonError', () => {
	it('logs the cause and returns structured error body', async () => {
		const cause = new Error('smtp down');
		const response = logAndJsonError(log as never, 500, 'Send failed', cause, {
			requestId: 'req-3'
		});
		expect(log.warn).toHaveBeenCalledWith({ err: cause, status: 500 }, 'Send failed');
		expect(response.status).toBe(500);
		await expect(response.json()).resolves.toEqual({
			error: 'Send failed',
			requestId: 'req-3'
		});
	});
});

describe('routeRateLimitResponse', () => {
	it('includes requestId from locals', async () => {
		const response = routeRateLimitResponse({ requestId: 'req-route-1' }, 15, 'Slow down.');
		await expect(response.json()).resolves.toEqual({
			error: 'Slow down.',
			retryAfterSeconds: 15,
			requestId: 'req-route-1'
		});
	});
});
