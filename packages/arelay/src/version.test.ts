import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PACKAGE_VERSION } from './version';

describe('PACKAGE_VERSION', () => {
	// The MCP server reports this as its serverInfo.version. It silently drifted to
	// 0.1.1 while the package was at 0.1.5, so clients and directory listings showed
	// a stale version. Pin the two together instead of relying on release discipline.
	it('matches the version in package.json', () => {
		const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
		const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string };
		expect(PACKAGE_VERSION).toBe(version);
	});
});
