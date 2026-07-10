// apps/web/src/lib/utils/public-author-seo.ts
import { SITE_URL } from '$lib/constants/seo';

export type PublicAuthorIndexData = {
	author: {
		slug_prefix: string;
		name: string | null;
		page_count: number;
	};
	pages: Array<{
		title: string;
		summary?: string | null;
		url_path: string;
		published_at?: string | null;
		last_updated_at?: string | null;
	}>;
};

export function buildPublicAuthorSeo(data: PublicAuthorIndexData) {
	const displayName = data.author.name?.trim() || data.author.slug_prefix;
	const pageCount = data.pages.length;
	const pageLabel = pageCount === 1 ? 'public page' : 'public pages';
	const canonical = `${SITE_URL}/p/${encodeURIComponent(data.author.slug_prefix)}`;
	const title = `Public pages by ${displayName} | BuildOS`;
	const description = `Read ${pageCount} ${pageLabel} by ${displayName}, published with BuildOS.`;

	return {
		title,
		description,
		canonical,
		author: displayName,
		keywords: `${displayName}, BuildOS public pages, published projects, shared documents`,
		noindex: pageCount === 0,
		jsonLd: {
			'@context': 'https://schema.org',
			'@type': 'CollectionPage',
			name: title,
			description,
			url: canonical,
			isPartOf: { '@id': `${SITE_URL}/#website` },
			about: data.author.name
				? {
						'@type': 'Person',
						name: displayName,
						url: canonical
					}
				: undefined,
			mainEntity: {
				'@type': 'ItemList',
				numberOfItems: pageCount,
				itemListElement: data.pages.map((page, index) => ({
					'@type': 'ListItem',
					position: index + 1,
					item: {
						'@type': 'WebPage',
						name: page.title,
						description: page.summary || undefined,
						url: new URL(page.url_path, SITE_URL).toString(),
						datePublished: page.published_at || undefined,
						dateModified: page.last_updated_at || page.published_at || undefined
					}
				}))
			}
		}
	};
}
