// apps/web/src/lib/server/public-page-sitemap.ts
import { SITE_URL } from '$lib/constants/seo';

export type PublicPageSitemapRow = {
	slug: string | null;
	slug_prefix: string | null;
	slug_base: string | null;
	published_at: string | null;
	last_live_sync_at: string | null;
	updated_at: string | null;
};

export type PublicPageSitemapUrl = {
	loc: string;
	lastmod: string | null;
	changefreq: 'weekly' | 'monthly';
	priority: '0.6' | '0.7';
};

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeSlug(value: string | null | undefined): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	return SAFE_SLUG.test(normalized) ? normalized : null;
}

function toSitemapDate(value: string | null | undefined): string | null {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function getLastmod(row: PublicPageSitemapRow): string | null {
	return (
		toSitemapDate(row.last_live_sync_at) ??
		toSitemapDate(row.updated_at) ??
		toSitemapDate(row.published_at)
	);
}

function escapeXml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

export function buildPublicPageSitemapUrls(rows: PublicPageSitemapRow[]): PublicPageSitemapUrl[] {
	const pageUrls = new Map<string, PublicPageSitemapUrl>();
	const authorLastmod = new Map<string, string | null>();

	for (const row of rows) {
		const slug = normalizeSlug(row.slug);
		const slugPrefix = normalizeSlug(row.slug_prefix);
		const slugBase = normalizeSlug(row.slug_base);
		const lastmod = getLastmod(row);

		const path =
			slugPrefix && slugBase ? `/p/${slugPrefix}/${slugBase}` : slug ? `/p/${slug}` : null;
		if (!path) continue;

		pageUrls.set(path, {
			loc: `${SITE_URL}${path}`,
			lastmod,
			changefreq: 'monthly',
			priority: '0.6'
		});

		if (slugPrefix) {
			const previous = authorLastmod.get(slugPrefix) ?? null;
			authorLastmod.set(
				slugPrefix,
				!previous || (lastmod && lastmod > previous) ? lastmod : previous
			);
		}
	}

	const authorUrls = [...authorLastmod.entries()].map(([slugPrefix, lastmod]) => ({
		loc: `${SITE_URL}/p/${slugPrefix}`,
		lastmod,
		changefreq: 'weekly' as const,
		priority: '0.7' as const
	}));

	return [...authorUrls, ...pageUrls.values()].sort((a, b) => a.loc.localeCompare(b.loc));
}

export function renderPublicPageSitemapXml(urls: PublicPageSitemapUrl[]): string {
	const entries = urls
		.map((url) => {
			const lastmod = url.lastmod ? `\n    <lastmod>${url.lastmod}</lastmod>` : '';
			return `  <url>\n    <loc>${escapeXml(url.loc)}</loc>${lastmod}\n    <changefreq>${url.changefreq}</changefreq>\n    <priority>${url.priority}</priority>\n  </url>`;
		})
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries ? `\n${entries}\n` : '\n'}</urlset>\n`;
}
