import { describe, expect, it } from 'vitest';
import { buildPreviewDoc, isFullHtmlDocument, toPreviewHtmlDocument } from './preview-doc';

describe('isFullHtmlDocument', () => {
	it('detects full HTML documents', () => {
		expect(isFullHtmlDocument('<!DOCTYPE html><html><body></body></html>')).toBe(true);
		expect(isFullHtmlDocument('<html lang="en"><body></body></html>')).toBe(true);
		expect(isFullHtmlDocument('<p>fragment</p>')).toBe(false);
	});
});

describe('toPreviewHtmlDocument', () => {
	it('wraps fragments and preserves full documents', () => {
		const fragment = toPreviewHtmlDocument('<p>Hello</p>', false);
		expect(fragment).toContain('<div class="wrap">');
		expect(fragment).toContain('<p>Hello</p>');

		const full = toPreviewHtmlDocument('<!doctype html><html><body><p>Hi</p></body></html>', false);
		expect(full).toContain('<!doctype html>');
		expect(full).not.toContain('class="wrap"');
	});

	it('strips external resources from wrapped fragments', () => {
		const doc = buildPreviewDoc('<img src="https://evil.com/x.png">', false);
		expect(doc).not.toContain('https://evil.com');
	});
});
