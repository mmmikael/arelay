import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyInlineImages } from './mcp.js';

describe('applyInlineImages', () => {
	let dir: string;
	let jpgPath: string;
	// Minimal fake JPEG bytes — applyInlineImages only reads + base64-encodes them.
	const jpgBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
	const jpgBase64 = jpgBytes.toString('base64');

	beforeAll(() => {
		dir = mkdtempSync(join(tmpdir(), 'arelay-inline-'));
		jpgPath = join(dir, 'widget.jpg');
		writeFileSync(jpgPath, jpgBytes);
	});

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	it('returns the html unchanged when no images are given', async () => {
		const html = '<p>Bonjour <img src="cid:widget"></p>';
		expect(await applyInlineImages(html, undefined)).toBe(html);
		expect(await applyInlineImages(html, [])).toBe(html);
	});

	it('replaces a cid reference with a base64 data URI read from disk', async () => {
		const html = '<p><img src="cid:widget" alt="Aperçu"></p>';
		const out = await applyInlineImages(html, [{ cid: 'widget', path: jpgPath }]);
		expect(out).toContain(`src="data:image/jpeg;base64,${jpgBase64}"`);
		expect(out).not.toContain('cid:widget');
	});

	it('replaces every occurrence of the same cid', async () => {
		const html = '<img src="cid:w"><img src="cid:w">';
		const out = await applyInlineImages(html, [{ cid: 'w', path: jpgPath }]);
		expect(out.match(/data:image\/jpeg;base64,/g)).toHaveLength(2);
		expect(out).not.toContain('cid:w');
	});

	it('maps the file extension to the right mime type', async () => {
		const pngPath = join(dir, 'widget.png');
		writeFileSync(pngPath, jpgBytes);
		const out = await applyInlineImages('<img src="cid:p">', [{ cid: 'p', path: pngPath }]);
		expect(out).toContain('data:image/png;base64,');
	});

	it('throws on an unsupported image extension', async () => {
		const badPath = join(dir, 'widget.svg');
		writeFileSync(badPath, '<svg/>');
		await expect(
			applyInlineImages('<img src="cid:x">', [{ cid: 'x', path: badPath }])
		).rejects.toThrow(/Unsupported inline image type/);
	});
});
