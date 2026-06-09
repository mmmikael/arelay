import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { encryptSecret } from './lib/secret-crypto.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsFolder = join(rootDir, 'drizzle');
const journalPath = join(migrationsFolder, 'meta', '_journal.json');

const PLUGIN_BASELINE_COLUMNS = [
	{ table: 'email_drafts', column: 'encrypted_review' },
	{ table: 'email_drafts', column: 'encrypted_sent' },
	{ table: 'user_cloudflare_email', column: 'account_id_ciphertext' }
];

function isEmailReviewRelayEnabled() {
	return process.env.EMAIL_REVIEW_RELAY_ENABLED?.trim().toLowerCase() === 'true';
}

function migrationHash(tag) {
	const sqlPath = join(migrationsFolder, `${tag}.sql`);
	const sql = readFileSync(sqlPath, 'utf8');
	return createHash('sha256').update(sql).digest('hex');
}

async function columnExists(db, table, column) {
	const [col] = await db`
		SELECT 1 AS ok
		FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = ${table}
			AND column_name = ${column}
		LIMIT 1
	`;
	return Boolean(col?.ok);
}

async function legacySchemaReady(db) {
	const [row] = await db`
		SELECT
			to_regclass('public.users')::text AS users_table,
			to_regclass('public.email_drafts')::text AS email_drafts_table
	`;
	if (!row?.users_table) return false;

	const pluginEnabled = isEmailReviewRelayEnabled();
	if (pluginEnabled && !row.email_drafts_table) {
		throw new Error(
			'Found users table but email_drafts is missing. Run npm run db:migrate on an empty database or apply plugin schema before baselining.'
		);
	}

	if (pluginEnabled) {
		for (const { table, column } of PLUGIN_BASELINE_COLUMNS) {
			if (!(await columnExists(db, table, column))) {
				throw new Error(
					`Legacy database is missing public.${table}.${column}. Apply pending schema changes before Drizzle cutover (do not auto-baseline).`
				);
			}
		}
	}

	return true;
}

async function migrateLegacyCloudflareAccountIds(db) {
	if (!(await columnExists(db, 'user_cloudflare_email', 'account_id'))) {
		return;
	}

	const sessionSecret = process.env.SESSION_SECRET;
	if (!sessionSecret?.trim()) {
		throw new Error(
			'SESSION_SECRET is required to migrate legacy user_cloudflare_email.account_id values.'
		);
	}

	const rows = await db`
		SELECT user_id, account_id
		FROM user_cloudflare_email
		WHERE account_id IS NOT NULL
			AND btrim(account_id) <> ''
			AND (
				account_id_ciphertext IS NULL
				OR btrim(account_id_ciphertext) = ''
			)
	`;

	for (const row of rows) {
		const accountIdCiphertext = encryptSecret(row.account_id.trim(), sessionSecret);
		await db`
			UPDATE user_cloudflare_email
			SET account_id_ciphertext = ${accountIdCiphertext}, updated_at = NOW()
			WHERE user_id = ${row.user_id}
		`;
	}

	if (rows.length > 0) {
		console.log(`Migrated ${rows.length} legacy Cloudflare account_id value(s) to account_id_ciphertext.`);
	}

	await db`ALTER TABLE user_cloudflare_email DROP COLUMN IF EXISTS account_id`;
}

async function maybeBaselineExistingSchema(db) {
	if (!(await legacySchemaReady(db))) return;

	await db`CREATE SCHEMA IF NOT EXISTS drizzle`;
	await db`
		CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at bigint
		)
	`;

	const [{ count }] = await db`
		SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations
	`;
	if (Number(count) > 0) return;

	const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
	for (const entry of journal.entries) {
		await db`
			INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
			VALUES (${migrationHash(entry.tag)}, ${entry.when})
		`;
	}

	console.log(
		`Baselined ${journal.entries.length} Drizzle migration(s) on existing schema (legacy ensureSchema → Drizzle cutover).`
	);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL is required');
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => undefined });

try {
	await maybeBaselineExistingSchema(sql);
	await migrate(drizzle(sql), { migrationsFolder });
	await migrateLegacyCloudflareAccountIds(sql);
	console.log('Database migrations applied.');
} finally {
	await sql.end();
}
