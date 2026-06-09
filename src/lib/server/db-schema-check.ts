import { env } from '$env/dynamic/private';
import * as pluginRegistry from '$lib/plugin-registry';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID } from '$plugins/email-review-relay';
import { getDb } from './db-connection';

let schemaReady = false;

function isEmailReviewRelayEnabled(): boolean {
	const plugin = pluginRegistry.PLUGINS.find((entry) => entry.id === EMAIL_REVIEW_RELAY_PLUGIN_ID);
	if (!plugin) return false;
	return pluginRegistry.isTruthyEnv(env[plugin.envFlag]);
}

const PLUGIN_BASELINE_COLUMNS = [
	{ table: 'email_drafts', column: 'encrypted_review' },
	{ table: 'email_drafts', column: 'encrypted_sent' },
	{ table: 'user_cloudflare_email', column: 'account_id_ciphertext' }
] as const;

export async function ensureSchema(): Promise<void> {
	if (schemaReady) return;
	const db = getDb();
	const [row] = await db<Array<{ users_table: string | null; email_drafts_table: string | null }>>`
		SELECT
			to_regclass('public.users')::text AS users_table,
			to_regclass('public.email_drafts')::text AS email_drafts_table
	`;
	if (!row?.users_table) {
		throw new Error('Database migrations have not been applied. Run npm run db:migrate.');
	}

	const pluginEnabled = isEmailReviewRelayEnabled();
	if (pluginEnabled && !row.email_drafts_table) {
		throw new Error(
			'Email Review Relay is enabled but email_drafts is missing. Run npm run db:migrate.'
		);
	}

	if (pluginEnabled) {
		for (const { table, column } of PLUGIN_BASELINE_COLUMNS) {
			const [col] = await db<Array<{ ok: number }>>`
				SELECT 1 AS ok
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = ${table}
					AND column_name = ${column}
				LIMIT 1
			`;
			if (!col?.ok) {
				throw new Error(
					`Database schema is outdated (missing public.${table}.${column}). Run npm run db:migrate.`
				);
			}
		}
	}

	schemaReady = true;
}

/** Test helper — reset cached readiness between cases. */
export function resetSchemaReadyForTests(): void {
	schemaReady = false;
}
