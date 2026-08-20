import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		},
		rules: {
			// `_`-prefixed bindings are deliberate placeholders (unused callback
			// params in fixtures, discarded destructuring targets).
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrors: 'none'
				}
			],
			// `try { localStorage… } catch {}` is intentional: storage access throws
			// in private browsing and when the user has disabled it, and every such
			// call site already has a safe fallback value.
			'no-empty': ['error', { allowEmptyCatch: true }]
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: { parser: ts.parser }
		},
		rules: {
			// The app is served from the root (no `kit.paths.base`), so plain
			// `href="/pricing"` and `goto('/portal')` resolve correctly. This rule
			// only matters for apps deployed under a subpath.
			'svelte/no-navigation-without-resolve': 'off',
			// State here is updated copy-on-write (`const next = new Set(prev);
			// next.add(x); value = next`), which `$state` tracks by reassignment.
			// SvelteSet/SvelteMap would add a dependency without changing behaviour.
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{
		// Generated output, migrations, and dependencies are not ours to lint.
		ignores: ['node_modules/', '.svelte-kit/', 'build/', 'packages/*/dist/', 'drizzle/', 'static/']
	}
);
