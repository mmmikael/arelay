import { spawn } from 'node:child_process';
import postgres from 'postgres';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
	console.log('TEST_DATABASE_URL is not set; skipping migration smoke check.');
	process.exit(0);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
try {
	const [{ table_count }] = await sql<Array<{ table_count: number }>>`
		SELECT COUNT(*)::int AS table_count
		FROM information_schema.tables
		WHERE table_schema = 'public'
	`;
	if (Number(table_count) > 0) {
		throw new Error('TEST_DATABASE_URL must point at an empty database.');
	}
} finally {
	await sql.end();
}

const migrateScript = new URL('./migrate-db.mjs', import.meta.url);
const child = spawn(process.execPath, [migrateScript.pathname], {
	stdio: 'inherit',
	env: { ...process.env, DATABASE_URL: url }
});

const exitCode = await new Promise<number>((resolve) => {
	child.on('close', (code) => resolve(code ?? 1));
});
if (exitCode !== 0) {
	process.exit(exitCode);
}

const migratedSql = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
try {
	const [row] = await migratedSql<Array<{ users_table: string | null; drafts_table: string | null }>>`
		SELECT
			to_regclass('public.users')::text AS users_table,
			to_regclass('public.email_drafts')::text AS drafts_table
	`;
	if (!row?.users_table || !row?.drafts_table) {
		throw new Error('Migration smoke check did not create expected tables.');
	}
	console.log('Migration smoke check passed.');
} finally {
	await migratedSql.end();
}
