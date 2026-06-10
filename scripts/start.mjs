#!/usr/bin/env node
/** Default adapter-node body limit for encrypted artifact uploads (~25 MB base64 JSON). */
if (!process.env.BODY_SIZE_LIMIT) {
	process.env.BODY_SIZE_LIMIT = '40M';
}

await import('../build/index.js');
