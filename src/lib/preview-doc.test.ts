import { describe, expect, it } from 'vitest';
import { buildPreviewDoc, injectPreviewFontHints, isFullHtmlDocument, toPreviewHtmlDocument } from './preview-doc';

describe('isFullHtmlDocument', () => {
	it('detects full HTML documents', () => {
		expect(isFullHtmlDocument('<!DOCTYPE html><html><body></body></html>')).toBe(true);
		expect(isFullHtmlDocument('<html lang="en"><body></body></html>')).toBe(true);
		expect(isFullHtmlDocument('<p>fragment</p>')).toBe(false);
	});
});

describe('toPreviewHtmlDocument', () => {
	it('wraps HTML fragments full-bleed and preserves full documents', () => {
		const fragment = toPreviewHtmlDocument('<p>Hello</p>', false);
		expect(fragment).not.toContain('class="wrap"');
		expect(fragment).toContain('<p>Hello</p>');
		expect(fragment).toContain('<body><p>Hello</p></body>');

		const full = toPreviewHtmlDocument('<!doctype html><html><body><p>Hi</p></body></html>', false);
		expect(full).toContain('<!doctype html>');
		expect(full).not.toContain('class="wrap"');
	});

	it('strips external resources from wrapped fragments', () => {
		const doc = buildPreviewDoc('<img src="https://evil.com/x.png">', false);
		expect(doc).not.toContain('https://evil.com');
	});

	it('preserves author CSS in full HTML documents', () => {
		const doc = toPreviewHtmlDocument(
			'<!doctype html><html><head><style>.card { padding: 2rem; }</style></head><body><div class="card">News</div></body></html>',
			false
		);
		expect(doc).toContain('.card { padding: 2rem; }');
		expect(doc).toContain('class="card"');
	});

	it('preserves line breaks in plain text bodies', () => {
		const doc = toPreviewHtmlDocument('Line one\n\nLine two', false);
		expect(doc).toContain('plain-text-body');
		expect(doc).toContain('Line one');
		expect(doc).toContain('Line two');
		expect(doc).not.toContain('class="wrap"');
	});
});
