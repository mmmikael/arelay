import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is required for Drizzle migrations');
}

export default defineConfig({
	schema: ['./src/lib/server/db-schema.ts', './src/plugins/email-review-relay/schema.ts'],
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL
	}
});
