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
`;

/**
 * Wrap server-rendered HTML in a styled, script-free document for a sandboxed iframe.
 * The iframe uses `sandbox=""`, so any scripts in `innerHtml` are inert.
 */
export function buildPreviewDoc(innerHtml: string, dark = false): string {
	const styleTag = `<style>${PREVIEW_STYLES}</style>`;
	const className = dark ? ' class="dark"' : '';
	return `<!doctype html><html${className}><head><meta charset="utf-8">${styleTag}</head><body><div class="wrap">${innerHtml}</div></body></html>`;
}
