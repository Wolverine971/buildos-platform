// apps/web/src/routes/sitemap-public-pages.xml/+server.ts
import type { RequestHandler } from './$types';
import {
	buildPublicPageSitemapUrls,
	renderPublicPageSitemapXml,
	type PublicPageSitemapRow
} from '$lib/server/public-page-sitemap';

const PAGE_SIZE = 1000;

export const GET: RequestHandler = async ({ locals }) => {
	const rows: PublicPageSitemapRow[] = [];

	for (let offset = 0; ; offset += PAGE_SIZE) {
		const { data, error } = await (locals.supabase as any)
			.from('onto_public_pages')
			.select('slug, slug_prefix, slug_base, published_at, last_live_sync_at, updated_at')
			.eq('status', 'published')
			.eq('public_status', 'live')
			.eq('visibility', 'public')
			.eq('noindex', false)
			.is('deleted_at', null)
			.order('slug', { ascending: true })
			.range(offset, offset + PAGE_SIZE - 1);

		if (error) {
			console.error('[Public sitemap] Failed to load public pages:', error);
			return new Response('Public sitemap temporarily unavailable', {
				status: 503,
				headers: {
					'Cache-Control': 'no-store',
					'Content-Type': 'text/plain; charset=utf-8',
					'Retry-After': '300'
				}
			});
		}

		const batch = Array.isArray(data) ? (data as PublicPageSitemapRow[]) : [];
		rows.push(...batch);
		if (batch.length < PAGE_SIZE) break;
	}

	const xml = renderPublicPageSitemapXml(buildPublicPageSitemapUrls(rows));
	return new Response(xml, {
		headers: {
			'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
			'Content-Type': 'application/xml; charset=utf-8'
		}
	});
};
