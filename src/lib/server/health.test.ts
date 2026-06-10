import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnsureSchema = vi.fn();
const mockDb = vi.fn();

vi.mock('$lib/server/db-schema-check', () => ({
	ensureSchema: (...args: unknown[]) => mockEnsureSchema(...args)
}));

vi.mock('$lib/server/db-connection', () => ({
	getDb: () => mockDb
}));

import { checkReadiness } from './health';

describe('checkReadiness', () => {
	beforeEach(() => {
		mockEnsureSchema.mockReset();
		mockDb.mockReset();
	});

	it('reports ready when schema and db query succeed', async () => {
		mockEnsureSchema.mockResolvedValue(undefined);
		mockDb.mockResolvedValue([{ ok: 1 }]);

		const result = await checkReadiness();
		expect(result).toEqual({
			ok: true,
			checks: { database: 'ok' }
		});
	});

	it('reports not ready when schema check fails', async () => {
		mockEnsureSchema.mockRejectedValue(new Error('migrations missing'));

		const result = await checkReadiness();
		expect(result.ok).toBe(false);
		expect(result.checks.database).toBe('error');
		expect(result.internalError).toBe('migrations missing');
	});

	it('reports not ready when db query fails', async () => {
		mockEnsureSchema.mockResolvedValue(undefined);
		mockDb.mockRejectedValue(new Error('connection refused'));

		const result = await checkReadiness();
		expect(result.ok).toBe(false);
		expect(result.checks.database).toBe('error');
		expect(result.internalError).toBe('connection refused');
	});
});
