import { ensureSchema } from '$lib/server/db-schema-check';
import { getDb } from '$lib/server/db-connection';

export type HealthCheckStatus = 'ok' | 'error';

export type ReadinessResult = {
	ok: boolean;
	checks: {
		database: HealthCheckStatus;
	};
	/** Operator-facing detail for logs — not for public responses. */
	internalError?: string;
};

export async function checkReadiness(): Promise<ReadinessResult> {
	const checks: ReadinessResult['checks'] = { database: 'error' };

	try {
		await ensureSchema();
		const db = getDb();
		await db`SELECT 1 AS ok`;
		checks.database = 'ok';
		return { ok: true, checks };
	} catch (err) {
		const internalError = err instanceof Error ? err.message : 'Database check failed';
		return { ok: false, checks, internalError };
	}
}
