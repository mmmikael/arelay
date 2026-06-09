import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as pluginRegistry from '$lib/plugin-registry';

const mockDb = vi.fn();

vi.mock('./db-connection', () => ({
	getDb: () => mockDb
}));

import { ensureSchema, resetSchemaReadyForTests } from './db-schema-check';

describe('ensureSchema', () => {
	beforeEach(() => {
		resetSchemaReadyForTests();
		mockDb.mockReset();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('requires users on all installs', async () => {
		mockDb.mockResolvedValueOnce([{ users_table: null, email_drafts_table: null }]);
		await expect(ensureSchema()).rejects.toThrow(/migrations have not been applied/i);
	});

	it('does not require plugin tables when plugin is disabled', async () => {
		vi.spyOn(pluginRegistry, 'isTruthyEnv').mockReturnValue(false);
		mockDb.mockResolvedValueOnce([{ users_table: 'users', email_drafts_table: null }]);
		await expect(ensureSchema()).resolves.toBeUndefined();
	});

	it('requires email_drafts when plugin is enabled', async () => {
		vi.spyOn(pluginRegistry, 'isTruthyEnv').mockReturnValue(true);
		mockDb.mockResolvedValueOnce([{ users_table: 'users', email_drafts_table: null }]);
		await expect(ensureSchema()).rejects.toThrow(/email_drafts is missing/i);
	});

	it('checks plugin columns when plugin is enabled', async () => {
		vi.spyOn(pluginRegistry, 'isTruthyEnv').mockReturnValue(true);
		mockDb
			.mockResolvedValueOnce([{ users_table: 'users', email_drafts_table: 'email_drafts' }])
			.mockResolvedValueOnce([{ ok: 0 }]);
		await expect(ensureSchema()).rejects.toThrow(/missing public\.email_drafts\.encrypted_review/i);
	});
});
