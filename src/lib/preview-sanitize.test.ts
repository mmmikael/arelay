import { describe, expect, it } from 'vitest';
import {
	artifactHtmlHasBlockedInteractivity,
	isExternalUrl,
	isDangerousUrl,
	sanitizeArtifactPreviewHtml,
	sanitizePreviewHtml
} from './preview-sanitize';

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

	it('strips nested or malformed event handler patterns', () => {
		const input = '<p oonclick="alert(1)">x</p><div ononmouseover="alert(2)">y</div>';
		const output = sanitizePreviewHtml(input);
		expect(output).not.toMatch(/\son[a-z]+\s*=/i);
	});
});

describe('sanitizeArtifactPreviewHtml', () => {
	it('keeps style tags and external stylesheets', () => {
		const input =
			'<style>body { color: red; }</style><link rel="stylesheet" href="https://fonts.googleapis.com/css"><p>Hi</p>';
		const output = sanitizeArtifactPreviewHtml(input);
		expect(output).toContain('<style>');
		expect(output).toContain('color: red');
		expect(output).toContain('fonts.googleapis.com');
		expect(output).toContain('<p>Hi</p>');
	});

	it('still removes scripts and inline handlers', () => {
		const input = '<p onclick="alert(1)">Hi</p><script>alert(1)</script>';
		const output = sanitizeArtifactPreviewHtml(input);
		expect(output).not.toContain('<script');
		expect(output).not.toContain('onclick');
		expect(output).toContain('<p>Hi</p>');
	});

	it('allows external images but blocks javascript URLs', () => {
		const input =
			'<img src="https://cdn.example.com/x.png"><a href="javascript:alert(1)">bad</a>';
		const output = sanitizeArtifactPreviewHtml(input);
		expect(output).toContain('cdn.example.com');
		expect(output).not.toContain('javascript:');
	});

	it('drops non-stylesheet link tags', () => {
		const input = '<link rel="preload" href="https://evil.com/app.js"><link rel="stylesheet" href="https://cdn.example.com/a.css">';
		const output = sanitizeArtifactPreviewHtml(input);
		expect(output).not.toContain('preload');
		expect(output).toContain('stylesheet');
	});

	it('keeps Google Fonts preconnect hints', () => {
		const input =
			'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="preconnect" href="https://evil.com">';
		const output = sanitizeArtifactPreviewHtml(input);
		expect(output).toContain('fonts.googleapis.com');
		expect(output).toContain('fonts.gstatic.com');
		expect(output).not.toContain('evil.com');
	});

	it('keeps unquoted stylesheet links', () => {
		const input = '<link rel=stylesheet href=https://fonts.googleapis.com/css2?family=Roboto>';
		const output = sanitizeArtifactPreviewHtml(input);
		expect(output).toContain('rel=stylesheet');
		expect(output).toContain('fonts.googleapis.com');
	});
});

describe('isDangerousUrl', () => {
	it('flags script protocols and data URLs', () => {
		expect(isDangerousUrl('javascript:alert(1)')).toBe(true);
		expect(isDangerousUrl('data:text/html,<script>alert(1)</script>')).toBe(true);
		expect(isDangerousUrl('https://example.com')).toBe(false);
	});
});

describe('artifactHtmlHasBlockedInteractivity', () => {
	it('is false for static HTML the sanitizer leaves unchanged', () => {
		expect(artifactHtmlHasBlockedInteractivity('<p>Hello</p>')).toBe(false);
		expect(
			artifactHtmlHasBlockedInteractivity(
				'<style>.x{color:red}</style><img src="https://cdn.example.com/a.png">'
			)
		).toBe(false);
	});

	it('is true when the sanitizer would strip active content', () => {
		expect(artifactHtmlHasBlockedInteractivity('<script>alert(1)</script>')).toBe(true);
		expect(artifactHtmlHasBlockedInteractivity('<p onclick="alert(1)">Hi</p>')).toBe(true);
		expect(artifactHtmlHasBlockedInteractivity('<a href="javascript:alert(1)">x</a>')).toBe(true);
		expect(
			artifactHtmlHasBlockedInteractivity('<meta http-equiv="refresh" content="0;url=https://x.com">')
		).toBe(true);
		expect(artifactHtmlHasBlockedInteractivity('<form action="/x"></form>')).toBe(true);
		expect(artifactHtmlHasBlockedInteractivity('<iframe src="https://x.com"></iframe>')).toBe(true);
		expect(
			artifactHtmlHasBlockedInteractivity('<link rel="modulepreload" href="https://x.com/a.js">')
		).toBe(true);
	});

	it('matches sanitizeArtifactPreviewHtml output', () => {
		const samples = [
			'<p>Hi</p>',
			'<script>alert(1)</script><p>Hi</p>',
			'<link rel="preload" href="https://evil.com/app.js">',
			'<a href="vbscript:msgbox(1)">bad</a>'
		];

		for (const sample of samples) {
			expect(artifactHtmlHasBlockedInteractivity(sample)).toBe(
				sanitizeArtifactPreviewHtml(sample) !== sample
			);
		}
	});
});
