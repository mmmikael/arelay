#!/usr/bin/env node
/** Default adapter-node body limit for encrypted artifact uploads (Pro plan allows 100 MB artifacts ≈ 134 MB base64 JSON). */
if (!process.env.BODY_SIZE_LIMIT) {
	process.env.BODY_SIZE_LIMIT = '140M';
}

await import('../build/index.js');
