import { sanitizeArtifactPreviewHtml, sanitizePreviewHtml } from '$lib/preview-sanitize';

const PREVIEW_STYLES = `
	:root { color-scheme: light; }
	:root.dark { color-scheme: dark; }
	body {
		margin: 0;
		padding: 1.5rem;
		font-family: 'DM Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
		line-height: 1.65;
		color: #0f172a;
		background: #fff;
	}
	.wrap { max-width: 48rem; margin: 0 auto; }
	h1, h2, h3 { font-weight: 600; margin: 1.25em 0 0.5em; line-height: 1.3; }
	p { margin: 0.75em 0; }
	a { color: #3b82f6; text-decoration: underline; }
	pre { background: #f1f5f9; border-radius: 0.75rem; padding: 1rem; overflow-x: auto; font-size: 0.875rem; }
	code { background: #f1f5f9; border-radius: 0.25rem; padding: 0.125rem 0.375rem; font-size: 0.875em; }
	pre code { background: none; padding: 0; }
	img { max-width: 100%; height: auto; }
	table { border-collapse: collapse; width: 100%; }
	th, td { border: 1px solid #e2e8f0; padding: 0.5rem 0.75rem; text-align: left; }
	:root.dark body {
		color: #e2e8f0;
		background: #020617;
	}
	:root.dark pre,
	:root.dark code {
		background: #1e293b;
	}
	:root.dark pre code {
		background: none;
	}
	:root.dark th,
	:root.dark td {
		border-color: #334155;
	}
	pre.plain-text-body {
		white-space: pre-wrap;
		word-break: break-word;
		font-family: ui-monospace, Menlo, Monaco, 'Cascadia Code', monospace;
		font-size: 0.875rem;
		line-height: 1.5;
		background: transparent;
		padding: 0;
		margin: 0;
		border-radius: 0;
	}
	:root.dark pre.plain-text-body {
		background: transparent;
	}
`;

const PLAIN_TEXT_PREVIEW_STYLES = `
	:root { color-scheme: light; }
	:root.dark { color-scheme: dark; }
	body {
		margin: 0;
		padding: 1rem;
		font-family: ui-monospace, Menlo, Monaco, 'Cascadia Code', monospace;
		font-size: 0.875rem;
		line-height: 1.5;
		color: #0f172a;
		background: #fff;
	}
	pre.plain-text-body {
		white-space: pre-wrap;
		word-break: break-word;
		margin: 0;
		padding: 0;
		font: inherit;
	}
	:root.dark body {
		color: #e2e8f0;
		background: #020617;
	}
`;

export function isFullHtmlDocument(html: string): boolean {
	const trimmed = html.trimStart();
	return /^<!doctype\s+html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed);
}

/** True when body has no HTML markup (plain text stored in the html field). */
export function looksLikePlainTextBody(html: string): boolean {
	const trimmed = html.trim();
	if (!trimmed) return false;
	if (isFullHtmlDocument(trimmed)) return false;
	return !/<\s*\/?[a-z!?]/i.test(trimmed);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export function plainTextBodyToPreviewHtml(text: string): string {
	return `<pre class="plain-text-body">${escapeHtml(text)}</pre>`;
}

/** Minimal HTML document for sending plain-text bodies as html. */
export function plainTextBodyToEmailHtml(text: string): string {
	const escaped = escapeHtml(text);
	return `<!DOCTYPE html><html><body><pre style="white-space:pre-wrap;font-family:ui-monospace,Menlo,Monaco,monospace;margin:0">${escaped}</pre></body></html>`;
}

/** Preconnect hints for Google Fonts when agent HTML references them. */
const FONT_PREVIEW_HEAD =
	'<link rel="preconnect" href="https://fonts.googleapis.com">' +
	'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>';

export function injectPreviewFontHints(html: string): string {
	if (/<head[\s>]/i.test(html)) {
		return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${FONT_PREVIEW_HEAD}`);
	}
	if (/<html[\s>]/i.test(html)) {
		return html.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${FONT_PREVIEW_HEAD}</head>`);
	}
	return html;
}

/**
 * Wrap sanitized HTML in a styled document for a sandboxed iframe.
 * Content is sanitized before rendering; scripts remain inert via `sandbox=""`.
 */
export function buildPreviewDoc(innerHtml: string, dark = false): string {
	return buildPreviewDocFromSanitized(sanitizePreviewHtml(innerHtml), dark);
}

function buildPreviewDocFromSanitized(sanitized: string, dark = false): string {
	const styleTag = `<style>${PREVIEW_STYLES}</style>`;
	const className = dark ? ' class="dark"' : '';
	return `<!doctype html><html${className}><head><meta charset="utf-8">${FONT_PREVIEW_HEAD}${styleTag}</head><body><div class="wrap">${sanitized}</div></body></html>`;
}

/** Full-bleed wrapper for HTML/email fragments (no max-width reading column). */
const ARTIFACT_FRAGMENT_PREVIEW_STYLES = `
	:root { color-scheme: light; }
	:root.dark { color-scheme: dark; }
	html, body {
		margin: 0;
		padding: 0;
		min-height: 100%;
	}
	img { max-width: 100%; height: auto; }
`;

function buildArtifactFragmentPreviewDoc(sanitized: string, dark = false): string {
	const styleTag = `<style>${ARTIFACT_FRAGMENT_PREVIEW_STYLES}</style>`;
	const className = dark ? ' class="dark"' : '';
	return `<!doctype html><html${className}><head><meta charset="utf-8">${FONT_PREVIEW_HEAD}${styleTag}</head><body>${sanitized}</body></html>`;
}

function buildPlainTextPreviewDoc(text: string, dark = false): string {
	const styleTag = `<style>${PLAIN_TEXT_PREVIEW_STYLES}</style>`;
	const className = dark ? ' class="dark"' : '';
	return `<!doctype html><html${className}><head><meta charset="utf-8">${styleTag}</head><body>${plainTextBodyToPreviewHtml(text)}</body></html>`;
}

/** Sanitize agent HTML and preserve full documents; wrap fragments for preview styling. */
export function toPreviewHtmlDocument(html: string, dark = false): string {
	if (isFullHtmlDocument(html)) {
		return injectPreviewFontHints(sanitizeArtifactPreviewHtml(html));
	}
	if (looksLikePlainTextBody(html)) {
		return buildPlainTextPreviewDoc(html, dark);
	}
	const sanitized = sanitizeArtifactPreviewHtml(html);
	return buildArtifactFragmentPreviewDoc(sanitized, dark);
}

/** Prepare html field for outbound email (preview parity). */
export function prepareHtmlBodyForEmail(html: string): string {
	if (isFullHtmlDocument(html)) {
		return sanitizeArtifactPreviewHtml(html);
	}
	if (looksLikePlainTextBody(html)) {
		return plainTextBodyToEmailHtml(html);
	}
	return sanitizeArtifactPreviewHtml(html);
}
