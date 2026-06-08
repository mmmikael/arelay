const BLOCKED_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'style'] as const;

/** Artifact iframe preview: allow author CSS; scripts stay blocked by tag strip + sandbox. */
const ARTIFACT_BLOCKED_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'base'] as const;

const URL_ATTRS = [
	'href',
	'src',
	'poster',
	'action',
	'formaction',
	'data-src',
	'data-href',
	'xlink:href'
] as const;

const EVENT_HANDLER_ATTR = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

function tagPattern(tags: readonly string[]): RegExp {
	return new RegExp(
		`<\\s*(${tags.join('|')})\\b[^>]*(?:>|\\/\\s*>)(?:[\\s\\S]*?<\\/\\s*\\1\\s*>)?`,
		'gi'
	);
}

function voidTagPattern(tags: readonly string[]): RegExp {
	return new RegExp(`<\\s*(${tags.join('|')})\\b[^>]*\\/\\s*>`, 'gi');
}

const ATTR_PATTERN = new RegExp(
	`\\s+(${URL_ATTRS.join('|')}|srcset)\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)`,
	'gi'
);

export function isExternalUrl(value: string): boolean {
	const url = value.trim();
	if (!url || url.startsWith('#')) return false;
	if (url.startsWith('/') && !url.startsWith('//')) return false;
	if (/^data:/i.test(url)) return false;
	if (/^blob:/i.test(url)) return false;
	if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return true;
	if (url.startsWith('//')) return true;
	return false;
}

function stripExternalFromSrcset(value: string): string {
	const kept = value
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean)
		.filter((part) => {
			const candidate = part.split(/\s+/)[0] ?? '';
			return !isExternalUrl(candidate);
		});
	return kept.join(', ');
}

function stripUnsafeMetaTags(html: string): string {
	return html.replace(/<meta\b[^>]*>/gi, (tag) => {
		if (/http-equiv\s*=\s*["']?\s*refresh/i.test(tag)) return '';
		if (/http-equiv\s*=\s*["']?\s*content-security-policy/i.test(tag)) return '';
		return tag;
	});
}

function stripBlockedTags(html: string, tags: readonly string[] = BLOCKED_TAGS): string {
	const paired = tagPattern(tags);
	const voided = voidTagPattern(tags);
	let out = html;
	let previous;
	do {
		previous = out;
		out = out.replace(paired, '').replace(voided, '');
	} while (out !== previous);
	return out;
}

function linkRelValue(tag: string): string {
	const match = tag.match(/\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
	return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').toLowerCase();
}

function linkHrefValue(tag: string): string {
	const match = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
	return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
}

const FONT_CDN_HOST = /^https:\/\/fonts\.(googleapis|gstatic)\.com/i;

function isAllowedPreviewLinkTag(tag: string): boolean {
	const rel = linkRelValue(tag);
	if (/\bstylesheet\b/.test(rel)) return true;
	if (/\bpreconnect\b/.test(rel) || /\bdns-prefetch\b/.test(rel)) {
		return FONT_CDN_HOST.test(linkHrefValue(tag));
	}
	return false;
}

function stripNonStylesheetLinks(html: string): string {
	return html.replace(/<link\b[^>]*>/gi, (tag) => (isAllowedPreviewLinkTag(tag) ? tag : ''));
}

export function isDangerousUrl(value: string): boolean {
	const url = value.trim().toLowerCase();
	return url.startsWith('javascript:') || url.startsWith('vbscript:');
}

function stripEventHandlers(html: string): string {
	let out = html;
	let previous;
	do {
		previous = out;
		out = out.replace(EVENT_HANDLER_ATTR, '');
	} while (out !== previous);
	return out;
}

function stripUnsafeAttributes(html: string): string {
	let out = html.replace(ATTR_PATTERN, (match, attr: string, rawValue: string) => {
		const value = rawValue.replace(/^['"]|['"]$/g, '');
		if (attr.toLowerCase() === 'srcset') {
			const cleaned = stripExternalFromSrcset(value);
			return cleaned ? ` srcset="${cleaned}"` : '';
		}
		return isExternalUrl(value) ? '' : match;
	});
	out = stripEventHandlers(out);
	return out;
}

function stripDangerousUrlAttributes(html: string): string {
	let out = html.replace(ATTR_PATTERN, (match, attr: string, rawValue: string) => {
		const value = rawValue.replace(/^['"]|['"]$/g, '');
		if (attr.toLowerCase() === 'srcset') {
			const kept = value
				.split(',')
				.map((part) => part.trim())
				.filter(Boolean)
				.filter((part) => !isDangerousUrl(part.split(/\s+/)[0] ?? ''));
			return kept.length ? ` srcset="${kept.join(', ')}"` : '';
		}
		return isDangerousUrl(value) ? '' : match;
	});
	out = stripEventHandlers(out);
	return out;
}

/**
 * Strip scripts, embedded browsing contexts, external resource URLs, and inline handlers
 * from agent-authored HTML before rendering in a sandboxed iframe.
 */
export function sanitizePreviewHtml(html: string): string {
	let out = stripBlockedTags(html);
	out = stripUnsafeMetaTags(out);
	out = stripUnsafeAttributes(out);
	return out;
}

/**
 * Sanitize agent-authored HTML artifacts for sandboxed iframe preview.
 * Keeps inline/external CSS and images; still removes scripts, embeds, and inline handlers.
 */
export function sanitizeArtifactPreviewHtml(html: string): string {
	let out = stripBlockedTags(html, ARTIFACT_BLOCKED_TAGS);
	out = stripNonStylesheetLinks(out);
	out = stripUnsafeMetaTags(out);
	out = stripDangerousUrlAttributes(out);
	return out;
}
