import { describe, expect, it } from 'vitest';
import { isExternalUrl, sanitizePreviewHtml } from './preview-sanitize';

describe('isExternalUrl', () => {
	it('treats absolute and protocol-relative URLs as external', () => {
		expect(isExternalUrl('https://evil.com')).toBe(true);
		expect(isExternalUrl('//evil.com/path')).toBe(true);
		expect(isExternalUrl('javascript:alert(1)')).toBe(true);
	});

	it('allows fragments, relative paths, and data URLs', () => {
		expect(isExternalUrl('#section')).toBe(false);
		expect(isExternalUrl('/local/path')).toBe(false);
		expect(isExternalUrl('data:image/png;base64,abc')).toBe(false);
	});
});

describe('sanitizePreviewHtml', () => {
	it('removes blocked tags and inline handlers', () => {
		const input =
			'<p onclick="alert(1)">Hi</p><script>alert(1)</script><iframe src="https://evil.com"></iframe>';
		const output = sanitizePreviewHtml(input);
		expect(output).not.toContain('<script');
		expect(output).not.toContain('<iframe');
		expect(output).not.toContain('onclick');
		expect(output).toContain('<p');
	});

	it('strips external href and src attributes', () => {
		const input =
			'<a href="https://evil.com">link</a><img src="https://evil.com/x.png" alt="x"><a href="#ok">ok</a>';
		const output = sanitizePreviewHtml(input);
		expect(output).not.toContain('https://evil.com');
		expect(output).toContain('<a');
		expect(output).toContain('#ok');
	});

	it('removes meta refresh redirects', () => {
		const input = '<meta http-equiv="refresh" content="0;url=https://evil.com"><meta charset="utf-8">';
		const output = sanitizePreviewHtml(input);
		expect(output).not.toContain('refresh');
		expect(output).toContain('charset');
	});
});
