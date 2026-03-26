// apps/web/src/routes/sitemap.xml/+server.ts
import type { RequestHandler } from './$types';
import { BLOG_CATEGORIES, loadBlogPosts } from '$lib/utils/blog';
import { HOME_PAGE_LAST_MODIFIED, SITE_URL } from '$lib/constants/seo';

export const prerender = true;

const STATIC_PAGES = [
	{ path: '/', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'weekly', priority: '1.0' },
	{ path: '/beta', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'weekly', priority: '0.9' },
	{ path: '/help', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'weekly', priority: '0.9' },
	{ path: '/road-map', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'weekly', priority: '0.9' },
	{ path: '/about', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'monthly', priority: '0.8' },
	{ path: '/pricing', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'weekly', priority: '0.8' },
	{ path: '/docs', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'weekly', priority: '0.7' },
	{ path: '/feedback', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'monthly', priority: '0.7' },
	{
		path: '/integrations',
		lastmod: HOME_PAGE_LAST_MODIFIED,
		changefreq: 'monthly',
		priority: '0.7'
	},
	{ path: '/contact', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'monthly', priority: '0.6' },
	{
		path: '/investors',
		lastmod: HOME_PAGE_LAST_MODIFIED,
		changefreq: 'monthly',
		priority: '0.6'
	},
	{ path: '/privacy', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'monthly', priority: '0.5' },
	{ path: '/terms', lastmod: HOME_PAGE_LAST_MODIFIED, changefreq: 'monthly', priority: '0.5' }
] as const;

function normalizeDate(value: string | undefined | null) {
	if (!value) return HOME_PAGE_LAST_MODIFIED;

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime())
		? HOME_PAGE_LAST_MODIFIED
		: parsed.toISOString().slice(0, 10);
}

function getLatestDate(values: Array<string | undefined | null>) {
	return (
		values
			.map((value) => normalizeDate(value))
			.sort()
			.at(-1) ?? HOME_PAGE_LAST_MODIFIED
	);
}

function escapeXml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

export const GET: RequestHandler = async () => {
	const blogPosts = await loadBlogPosts();
	const latestBlogLastMod = getLatestDate(blogPosts.map((post) => post.lastmod || post.date));
	const categoryRoutes = Object.keys(BLOG_CATEGORIES).map((categoryKey) => {
		const categoryPosts = blogPosts.filter((post) => post.category === categoryKey);

		return {
			path: `/blogs/${categoryKey}`,
			lastmod: getLatestDate(categoryPosts.map((post) => post.lastmod || post.date)),
			changefreq: 'weekly',
			priority: '0.6'
		};
	});

	const urls = [
		...STATIC_PAGES,
		{
			path: '/blogs',
			lastmod: latestBlogLastMod,
			changefreq: 'weekly',
			priority: '0.7'
		},
		...categoryRoutes,
		...blogPosts.map((post) => ({
			path: `/blogs/${post.category}/${post.slug}`,
			lastmod: normalizeDate(post.lastmod || post.date),
			changefreq: post.changefreq || 'monthly',
			priority: post.priority || '0.7'
		}))
	];

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
	.map(
		(entry) => `  <url>
    <loc>${escapeXml(`${SITE_URL}${entry.path}`)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
    <changefreq>${escapeXml(entry.changefreq)}</changefreq>
    <priority>${escapeXml(entry.priority)}</priority>
  </url>`
	)
	.join('\n')}
</urlset>`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
			'Cache-Control': 'public, max-age=0, s-maxage=3600'
		}
	});
};
