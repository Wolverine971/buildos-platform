// apps/web/src/lib/utils/public-author-seo.test.ts
import { describe, expect, it } from 'vitest';
import { buildPublicAuthorSeo } from './public-author-seo';

describe('public author index SEO', () => {
	it('builds canonical metadata and CollectionPage structured data', () => {
		const seo = buildPublicAuthorSeo({
			author: { slug_prefix: 'dj-wayne', name: 'DJ Wayne', page_count: 2 },
			pages: [
				{
					title: 'Alpha',
					summary: 'First public page',
					url_path: '/p/dj-wayne/alpha',
					published_at: '2026-07-01T00:00:00.000Z',
					last_updated_at: '2026-07-09T00:00:00.000Z'
				},
				{
					title: 'Beta',
					url_path: '/p/dj-wayne/beta'
				}
			]
		});

		expect(seo).toMatchObject({
			title: 'Public pages by DJ Wayne | BuildOS',
			description: 'Read 2 public pages by DJ Wayne, published with BuildOS.',
			canonical: 'https://build-os.com/p/dj-wayne',
			author: 'DJ Wayne',
			noindex: false
		});
		expect(seo.jsonLd).toMatchObject({
			'@type': 'CollectionPage',
			mainEntity: {
				'@type': 'ItemList',
				numberOfItems: 2
			}
		});
		expect(seo.jsonLd.mainEntity.itemListElement[0]).toMatchObject({
			position: 1,
			item: {
				url: 'https://build-os.com/p/dj-wayne/alpha',
				dateModified: '2026-07-09T00:00:00.000Z'
			}
		});
	});

	it('marks empty author collections noindex', () => {
		const seo = buildPublicAuthorSeo({
			author: { slug_prefix: 'empty-author', name: null, page_count: 0 },
			pages: []
		});

		expect(seo.noindex).toBe(true);
		expect(seo.canonical).toBe('https://build-os.com/p/empty-author');
		expect(seo.jsonLd.mainEntity).toMatchObject({ numberOfItems: 0 });
	});
});
