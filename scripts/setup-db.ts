import postgres from 'postgres';
import { SCHEMA_LOCK_ID, SCHEMA_LOCK_NAMESPACE, SCHEMA_SQL } from '../src/lib/server/schema';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is required');
	process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });

await sql`SELECT pg_advisory_lock(${SCHEMA_LOCK_NAMESPACE}, ${SCHEMA_LOCK_ID})`;
try {
	await sql.unsafe(SCHEMA_SQL);
} finally {
	await sql`SELECT pg_advisory_unlock(${SCHEMA_LOCK_NAMESPACE}, ${SCHEMA_LOCK_ID})`;
	await sql.end();
}
console.log('Database schema ready.');
