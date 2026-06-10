import { describe, expect, it } from 'vitest';
import { resolveRequestId } from './request-id';

describe('resolveRequestId', () => {
	it('generates a UUID when no header is present', () => {
		const request = new Request('https://example.com/');
		const id = resolveRequestId(request);
		expect(id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
		);
	});

	it('reuses a valid incoming x-request-id', () => {
		const request = new Request('https://example.com/', {
			headers: { 'x-request-id': 'upstream-abc-123' }
		});
		expect(resolveRequestId(request)).toBe('upstream-abc-123');
	});

	it('ignores empty, overlong, or unsafe incoming ids', () => {
		const empty = new Request('https://example.com/', {
			headers: { 'x-request-id': '   ' }
		});
		expect(resolveRequestId(empty)).toMatch(/^[0-9a-f-]{36}$/i);

		const overlong = new Request('https://example.com/', {
			headers: { 'x-request-id': 'x'.repeat(129) }
		});
		expect(resolveRequestId(overlong)).toMatch(/^[0-9a-f-]{36}$/i);

		const unsafe = new Request('https://example.com/', {
			headers: { 'x-request-id': 'bad/id' }
		});
		expect(resolveRequestId(unsafe)).toMatch(/^[0-9a-f-]{36}$/i);
	});
});
