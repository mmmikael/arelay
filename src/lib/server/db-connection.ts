import postgres from 'postgres';
import { env } from '$env/dynamic/private';

let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
	const url = env.DATABASE_URL;
	if (!url) {
		throw new Error('DATABASE_URL is not set');
	}
	if (!sql) {
		sql = postgres(url, {
			max: 10,
			prepare: false,
			idle_timeout: 20,
			connect_timeout: 10,
			onnotice: () => undefined
		});
	}
	return sql;
}
