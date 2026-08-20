import { env } from '$env/dynamic/private';
import * as pluginRegistry from '$lib/plugin-registry';
import { EMAIL_REVIEW_RELAY_PLUGIN_ID } from '$plugins/email-review-relay';
import { SPEND_REVIEW_RELAY_PLUGIN_ID } from '$plugins/spend-review-relay';
import { isBillingEnabled } from './billing/config';
import { getDb } from './db-connection';

let schemaReady = false;

function isPluginEnabled(id: string): boolean {
	const plugin = pluginRegistry.PLUGINS.find((entry) => entry.id === id);
	if (!plugin) return false;
	return pluginRegistry.isTruthyEnv(env[plugin.envFlag]);
}

function isEmailReviewRelayEnabled(): boolean {
	return isPluginEnabled(EMAIL_REVIEW_RELAY_PLUGIN_ID);
}

function isSpendReviewRelayEnabled(): boolean {
	return isPluginEnabled(SPEND_REVIEW_RELAY_PLUGIN_ID);
}

const PLUGIN_BASELINE_COLUMNS = [
	{ table: 'email_drafts', column: 'encrypted_review' },
	{ table: 'email_drafts', column: 'encrypted_sent' },
	{ table: 'user_cloudflare_email', column: 'account_id_ciphertext' }
] as const;

const SPEND_BASELINE_COLUMNS = [
	{ table: 'spend_requests', column: 'payment_intent_id' },
	{ table: 'spend_requests', column: 'encrypted_receipt' },
	{ table: 'user_stripe_credentials', column: 'secret_key_ciphertext' }
] as const;

export async function ensureSchema(): Promise<void> {
	if (schemaReady) return;
	const db = getDb();
	const [row] = await db<
		Array<{
			users_table: string | null;
			email_drafts_table: string | null;
			spend_requests_table: string | null;
			rate_limit_buckets_table: string | null;
			billing_accounts_table: string | null;
		}>
	>`
		SELECT
			to_regclass('public.users')::text AS users_table,
			to_regclass('public.email_drafts')::text AS email_drafts_table,
			to_regclass('public.spend_requests')::text AS spend_requests_table,
			to_regclass('public.rate_limit_buckets')::text AS rate_limit_buckets_table,
			to_regclass('public.billing_accounts')::text AS billing_accounts_table
	`;
	if (!row?.users_table) {
		throw new Error('Database migrations have not been applied. Run npm run db:migrate.');
	}

	if (!row.rate_limit_buckets_table) {
		throw new Error(
			'Database schema is outdated (missing public.rate_limit_buckets). Run npm run db:migrate.'
		);
	}

	if (isBillingEnabled() && !row.billing_accounts_table) {
		throw new Error('Billing is enabled but billing_accounts is missing. Run npm run db:migrate.');
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

	const spendEnabled = isSpendReviewRelayEnabled();
	if (spendEnabled && !row.spend_requests_table) {
		throw new Error(
			'Spend Review Relay is enabled but spend_requests is missing. Run npm run db:migrate.'
		);
	}

	if (spendEnabled) {
		for (const { table, column } of SPEND_BASELINE_COLUMNS) {
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
