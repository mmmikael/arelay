import { defineConfig } from 'vitest/config';

// Standalone config so vitest does not walk up and load the SvelteKit app's
// vite config from the repo root.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts']
	}
});
