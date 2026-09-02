export const DEFAULT_SITE_TITLE = 'Agent Relay';

export const DEFAULT_SITE_DESCRIPTION =
	'Agent Relay is where your AI agents ask permission. Agents draft emails, request spend, and deliver work into a private encrypted inbox. Nothing sends or charges until you approve it.';

export const OG_IMAGE_PATH = '/og-image.jpg';
export const OG_IMAGE_WIDTH = 1024;
export const OG_IMAGE_HEIGHT = 537;

export const PUBLIC_INDEXABLE_PATHS = [
	'/',
	'/pricing',
	'/getting-started',
	'/security',
	'/terms',
	'/privacy'
] as const;

export const ROBOTS_DISALLOW_PATHS = [
	'/portal/',
	'/api/',
	'/dev/',
	'/legal/',
	'/health/',
	'/webhooks/'
] as const;

export function siteOriginFromRequest(origin: string, configuredOrigin?: string): string {
	const value = configuredOrigin?.trim() || origin;
	return value.replace(/\/$/, '');
}

export function isPublicIndexablePath(pathname: string): boolean {
	return (PUBLIC_INDEXABLE_PATHS as readonly string[]).includes(pathname);
}

export function publicCanonicalUrl(siteOrigin: string, pathname: string): string | null {
	if (!isPublicIndexablePath(pathname)) return null;
	return pathname === '/' ? siteOrigin : `${siteOrigin}${pathname}`;
}

export function buildRobotsTxt(siteOrigin: string): string {
	const disallow = ROBOTS_DISALLOW_PATHS.map((path) => `Disallow: ${path}`).join('\n');
	return `User-agent: *
Allow: /

${disallow}

Sitemap: ${siteOrigin}/sitemap.xml
`;
}

export function buildSitemapXml(siteOrigin: string): string {
	const urls = PUBLIC_INDEXABLE_PATHS.map((path) => {
		const loc = path === '/' ? siteOrigin : `${siteOrigin}${path}`;
		return `  <url>\n    <loc>${loc}</loc>\n  </url>`;
	}).join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}
