// apps/web/src/lib/server/public-page-sitemap.test.ts
import { describe, expect, it } from 'vitest';
import { buildPublicPageSitemapUrls, renderPublicPageSitemapXml } from './public-page-sitemap';

describe('public page sitemap', () => {
	it('emits canonical page and author URLs with real stable lastmod dates', () => {
		const urls = buildPublicPageSitemapUrls([
			{
				slug: 'dj-wayne-alpha',
				slug_prefix: 'dj-wayne',
				slug_base: 'alpha',
				published_at: '2026-06-01T12:00:00.000Z',
				last_live_sync_at: '2026-07-09T13:30:00.000Z',
				updated_at: '2026-07-08T12:00:00.000Z'
			},
			{
				slug: 'dj-wayne-beta',
				slug_prefix: 'dj-wayne',
				slug_base: 'beta',
				published_at: '2026-07-01T12:00:00.000Z',
				last_live_sync_at: null,
				updated_at: '2026-07-10T08:00:00.000Z'
			},
			{
				slug: 'legacy-page',
				slug_prefix: null,
				slug_base: null,
				published_at: '2026-05-03',
				last_live_sync_at: null,
				updated_at: null
			},
			{
				slug: '../private',
				slug_prefix: null,
				slug_base: null,
				published_at: '2026-07-10',
				last_live_sync_at: null,
				updated_at: null
			}
		]);

		expect(urls).toEqual([
			expect.objectContaining({
				loc: 'https://build-os.com/p/dj-wayne',
				lastmod: '2026-07-10',
				changefreq: 'weekly'
			}),
			expect.objectContaining({
				loc: 'https://build-os.com/p/dj-wayne/alpha',
				lastmod: '2026-07-09'
			}),
			expect.objectContaining({
				loc: 'https://build-os.com/p/dj-wayne/beta',
				lastmod: '2026-07-10'
			}),
			expect.objectContaining({
				loc: 'https://build-os.com/p/legacy-page',
				lastmod: '2026-05-03'
			})
		]);
	});

	it('renders valid XML and omits invented lastmod values', () => {
		const xml = renderPublicPageSitemapXml([
			{
				loc: 'https://build-os.com/p/example',
				lastmod: null,
				changefreq: 'monthly',
				priority: '0.6'
			}
		]);

		expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
		expect(xml).toContain('<loc>https://build-os.com/p/example</loc>');
		expect(xml).not.toContain('<lastmod>');
	});
});
