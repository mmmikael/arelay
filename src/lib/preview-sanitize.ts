const BLOCKED_TAGS = ['script', 'iframe', 'object', 'embed', 'form', 'base', 'link', 'style'] as const;

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

const TAG_PATTERN = new RegExp(
	`<\\s*(${BLOCKED_TAGS.join('|')})\\b[^>]*(?:>|\\/\\s*>)(?:[\\s\\S]*?<\\/\\s*\\1\\s*>)?`,
	'gi'
);

const VOID_TAG_PATTERN = new RegExp(`<\\s*(${BLOCKED_TAGS.join('|')})\\b[^>]*\\/\\s*>`, 'gi');

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

function stripBlockedTags(html: string): string {
	let out = html;
	let previous;
	do {
		previous = out;
		out = out.replace(TAG_PATTERN, '').replace(VOID_TAG_PATTERN, '');
	} while (out !== previous);
	return out;
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
