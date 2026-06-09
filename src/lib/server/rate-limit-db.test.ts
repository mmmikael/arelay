import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type BucketRow = { count: number; window_start: Date };

const buckets = new Map<string, BucketRow>();

function mockDb(strings: TemplateStringsArray, ...values: unknown[]) {
	const sql = strings.join(' ').replace(/\s+/g, ' ').trim();

	if (sql.startsWith('INSERT INTO rate_limit_buckets')) {
		const bucketKey = values[0] as string;
		const windowStart = values[1] as Date;
		const existing = buckets.get(bucketKey);
		let count = 1;
		if (existing && existing.window_start.getTime() >= windowStart.getTime()) {
			count = existing.count + 1;
		} else if (existing) {
			count = 1;
		}
		const row = { count, window_start: windowStart };
		buckets.set(bucketKey, row);
		return Promise.resolve([row]);
	}

	if (sql.startsWith('SELECT count, window_start')) {
		const bucketKey = values[0] as string;
		const row = buckets.get(bucketKey);
		return Promise.resolve(row ? [row] : []);
	}

	return Promise.resolve([]);
}

vi.mock('$lib/server/db-connection', () => ({
	getDb: () => mockDb
}));

import { checkRateLimit, peekRateLimit } from './rate-limit-db';

describe('rate-limit-db', () => {
	beforeEach(() => {
		buckets.clear();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('allows requests up to the configured limit', async () => {
		const config = { limit: 2, windowMs: 60_000 };
		await expect(checkRateLimit('auth-ip:1.2.3.4', config, 0)).resolves.toEqual({ ok: true });
		await expect(checkRateLimit('auth-ip:1.2.3.4', config, 0)).resolves.toEqual({ ok: true });
	});

	it('blocks once the limit is exceeded', async () => {
		const config = { limit: 2, windowMs: 60_000 };
		await checkRateLimit('auth-ip:1.2.3.4', config, 0);
		await checkRateLimit('auth-ip:1.2.3.4', config, 0);
		const blocked = await checkRateLimit('auth-ip:1.2.3.4', config, 0);
		expect(blocked.ok).toBe(false);
		if (!blocked.ok) {
			expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
		}
	});

	it('resets the counter when a new window starts', async () => {
		const config = { limit: 1, windowMs: 60_000 };
		await checkRateLimit('auth-ip:1.2.3.4', config, 0);
		const blocked = await checkRateLimit('auth-ip:1.2.3.4', config, 0);
		expect(blocked.ok).toBe(false);

		const nextWindow = await checkRateLimit('auth-ip:1.2.3.4', config, 120_000);
		expect(nextWindow.ok).toBe(true);
	});

	it('peek blocks without incrementing the counter', async () => {
		const config = { limit: 1, windowMs: 60_000 };
		await checkRateLimit('agent-401-ip:1.2.3.4', config, 0);
		await checkRateLimit('agent-401-ip:1.2.3.4', config, 0);
		const beforePeek = buckets.get('agent-401-ip:1.2.3.4')?.count;

		const peekBlocked = await peekRateLimit('agent-401-ip:1.2.3.4', config, 0);
		expect(peekBlocked.ok).toBe(false);
		expect(buckets.get('agent-401-ip:1.2.3.4')?.count).toBe(beforePeek);
	});
});
