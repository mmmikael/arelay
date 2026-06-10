import { describe, expect, it } from 'vitest';
import {
	buildRobotsTxt,
	buildSitemapXml,
	isPublicIndexablePath,
	publicCanonicalUrl,
	siteOriginFromRequest
} from './seo';

describe('siteOriginFromRequest', () => {
	it('prefers configured origin over request origin', () => {
		expect(siteOriginFromRequest('http://127.0.0.1:5173', 'https://arelay.app/')).toBe(
			'https://arelay.app'
		);
	});

	it('falls back to request origin and strips trailing slash', () => {
		expect(siteOriginFromRequest('http://127.0.0.1:5173/')).toBe('http://127.0.0.1:5173');
	});
});

describe('isPublicIndexablePath', () => {
	it('allows only public marketing and legal pages', () => {
		expect(isPublicIndexablePath('/')).toBe(true);
		expect(isPublicIndexablePath('/terms')).toBe(true);
		expect(isPublicIndexablePath('/privacy')).toBe(true);
		expect(isPublicIndexablePath('/portal')).toBe(false);
		expect(isPublicIndexablePath('/portal/session-1')).toBe(false);
	});
});

describe('publicCanonicalUrl', () => {
	it('returns canonical URLs for public pages only', () => {
		expect(publicCanonicalUrl('https://arelay.app', '/')).toBe('https://arelay.app');
		expect(publicCanonicalUrl('https://arelay.app', '/terms')).toBe('https://arelay.app/terms');
		expect(publicCanonicalUrl('https://arelay.app', '/portal')).toBeNull();
	});
});

describe('buildRobotsTxt', () => {
	it('blocks private routes and links the sitemap', () => {
		const body = buildRobotsTxt('https://arelay.app');
		expect(body).toContain('Disallow: /portal/');
		expect(body).toContain('Disallow: /api/');
		expect(body).toContain('Sitemap: https://arelay.app/sitemap.xml');
	});
});

describe('buildSitemapXml', () => {
	it('lists only public indexable pages', () => {
		const body = buildSitemapXml('https://arelay.app');
		expect(body).toContain('<loc>https://arelay.app</loc>');
		expect(body).toContain('<loc>https://arelay.app/terms</loc>');
		expect(body).toContain('<loc>https://arelay.app/privacy</loc>');
		expect(body).not.toContain('/portal');
	});
});
