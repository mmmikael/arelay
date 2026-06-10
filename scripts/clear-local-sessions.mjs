/**
 * Delete all inbox sessions for local demo resets.
 * Cascades artifacts + email_drafts. Does not purge S3 blobs.
 *
 *   node --env-file=.env scripts/clear-local-sessions.mjs
 */
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error('DATABASE_URL is required (use node --env-file=.env)');
	process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
try {
	const before = await sql`SELECT count(*)::int AS n FROM inbox_sessions`;
	const [{ n: deleted }] =
		await sql`WITH gone AS (DELETE FROM inbox_sessions RETURNING id) SELECT count(*)::int AS n FROM gone`;
	console.log(`Removed ${deleted} session(s) (was ${before[0].n}).`);
} finally {
	await sql.end();
}
