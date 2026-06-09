import { spawn } from 'node:child_process';

if (!process.env.DATABASE_URL) {
	console.error('DATABASE_URL is required');
	process.exit(1);
}

const migrateScript = new URL('./migrate-db.mjs', import.meta.url);
const child = spawn(process.execPath, [migrateScript.pathname], {
	stdio: 'inherit',
	env: process.env
});

const exitCode = await new Promise<number>((resolve) => {
	child.on('close', (code) => resolve(code ?? 1));
});

process.exit(exitCode);
