// apps/web/scripts/generate-sitemap.ts
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface SitemapUrl {
	loc: string;
	lastmod: string;
	changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
	priority: string;
}

interface BlogPost {
	title: string;
	lastmod: string;
	changefreq: string;
	date: string;
	priority: string;
	published: boolean;
	slug: string;
	category: string;
}

interface BlogContext {
	categories: {
		[categoryKey: string]: {
			metadata: {
				name: string;
				description: string;
				color: string;
			};
			posts: {
				[slug: string]: BlogPost | null;
			};
		};
	};
	generatedAt: string;
}

const BASE_URL = 'https://build-os.com';
// Use a static fallback date instead of today's date to avoid constantly changing dates
// This should be the date of the initial blog launch or earliest blog post
const DEFAULT_LASTMOD = '2025-10-05'; // Static fallback date for empty categories

// Static URLs from your existing sitemap
const STATIC_URLS: SitemapUrl[] = [
	{
		loc: `${BASE_URL}/`,
		lastmod: '2025-12-19',
		changefreq: 'weekly',
		priority: '1.0'
	},
	{
		loc: `${BASE_URL}/about`,
		lastmod: '2025-12-19',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/pricing`,
		lastmod: '2025-12-19',
		changefreq: 'weekly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/blogs`,
		lastmod: '2025-12-19',
		changefreq: 'weekly',
		priority: '0.7'
	},
	{
		loc: `${BASE_URL}/contact`,
		lastmod: '2025-12-19',
		changefreq: 'monthly',
		priority: '0.6'
	},
	{
		loc: `${BASE_URL}/beta`,
		lastmod: '2025-12-19',
		changefreq: 'weekly',
		priority: '0.9'
	},
	{
		loc: `${BASE_URL}/road-map`,
		lastmod: '2025-12-19',
		changefreq: 'weekly',
		priority: '0.9'
	},
	{
		loc: `${BASE_URL}/help`,
		lastmod: '2025-12-19',
		changefreq: 'weekly',
		priority: '0.9'
	},
	{
		loc: `${BASE_URL}/investors`,
		lastmod: '2025-12-19',
		changefreq: 'monthly',
		priority: '0.6'
	},
	{
		loc: `${BASE_URL}/integrations`,
		lastmod: '2025-12-19',
		changefreq: 'monthly',
		priority: '0.7'
	},
	{
		loc: `${BASE_URL}/feedback`,
		lastmod: '2025-12-19',
		changefreq: 'monthly',
		priority: '0.7'
	},
	{
		loc: `${BASE_URL}/privacy`,
		lastmod: '2025-12-19',
		changefreq: 'monthly',
		priority: '0.5'
	},
	{
		loc: `${BASE_URL}/terms`,
		lastmod: '2025-12-19',
		changefreq: 'monthly',
		priority: '0.5'
	},
	{
		loc: `${BASE_URL}/docs`,
		lastmod: '2025-12-19',
		changefreq: 'weekly',
		priority: '0.7'
	}
];

function formatDateToYYYYMMDD(dateString: string): string {
	const date = new Date(dateString);
	const year = date.getFullYear();
	const month = (date.getMonth() + 1).toString().padStart(2, '0');
	const day = date.getDate().toString().padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function loadBlogContext(): BlogContext | null {
	const blogContextPath = join(process.cwd(), 'src', 'content', 'blogs', 'blog-context.json');

	if (!existsSync(blogContextPath)) {
		console.warn('⚠️  blog-context.json not found. Run gen:blog-context first.');
		return null;
	}

	try {
		const content = readFileSync(blogContextPath, 'utf-8');
		return JSON.parse(content);
	} catch (error) {
		console.error('❌ Failed to parse blog-context.json:', error);
		return null;
	}
}

function getPostLastMod(post: BlogPost): string {
	// Priority: lastmod > date > default
	if (post.lastmod) {
		return formatDateToYYYYMMDD(post.lastmod);
	}
	if (post.date) {
		return formatDateToYYYYMMDD(post.date);
	}
	return DEFAULT_LASTMOD;
}

function getMostRecentPostDate(posts: { [slug: string]: BlogPost | null }): string | null {
	let mostRecentDate = '';

	Object.values(posts).forEach((post) => {
		if (post && post.published) {
			const postDate = getPostLastMod(post);
			if (!mostRecentDate || postDate > mostRecentDate) {
				mostRecentDate = postDate;
			}
		}
	});

	// Return null if no published posts found, instead of DEFAULT_LASTMOD
	return mostRecentDate || null;
}

function getAllPostsLastModDate(blogContext: BlogContext): string {
	let mostRecentDate = '';

	Object.values(blogContext.categories).forEach((category) => {
		const categoryMostRecent = getMostRecentPostDate(category.posts);
		// Only consider categories that have published posts (non-null dates)
		if (categoryMostRecent && (!mostRecentDate || categoryMostRecent > mostRecentDate)) {
			mostRecentDate = categoryMostRecent;
		}
	});

	// Use the original static blogs page date as fallback if no posts found
	return mostRecentDate || '2025-06-28';
}

function generateBlogUrls(blogContext: BlogContext): SitemapUrl[] {
	const urls: SitemapUrl[] = [];

	// Update main blogs page with most recent post date across all categories
	const mainBlogIndex = STATIC_URLS.findIndex((url) => url.loc === `${BASE_URL}/blogs`);
	if (mainBlogIndex !== -1) {
		const mostRecentGlobalDate = getAllPostsLastModDate(blogContext);
		STATIC_URLS[mainBlogIndex].lastmod = mostRecentGlobalDate;
		console.log(`📅 Updated main blogs page lastmod to: ${mostRecentGlobalDate}`);
	}

	// Add category pages with smart lastmod dates (only if they have published posts)
	Object.entries(blogContext.categories).forEach(([categoryKey, category]) => {
		const mostRecentPostDate = getMostRecentPostDate(category.posts);

		// Only add category page if it has published posts
		if (mostRecentPostDate) {
			urls.push({
				loc: `${BASE_URL}/blogs/${categoryKey}`,
				lastmod: mostRecentPostDate,
				changefreq: 'weekly',
				priority: '0.6'
			});

			console.log(`📅 Category '${categoryKey}' lastmod set to: ${mostRecentPostDate}`);
		} else {
			console.log(`⏩ Skipping category '${categoryKey}' - no published posts`);
		}
	});

	// Add individual blog post pages
	Object.entries(blogContext.categories).forEach(([categoryKey, category]) => {
		Object.entries(category.posts).forEach(([slug, post]) => {
			if (post && post.published) {
				const postLastMod = getPostLastMod(post);

				urls.push({
					loc: `${BASE_URL}/blogs/${categoryKey}/${slug}`,
					lastmod: postLastMod,
					changefreq: (post.changefreq as any) || 'monthly',
					priority: post.priority || '0.6'
				});
			}
		});
	});

	return urls;
}

function generateSitemapXml(urls: SitemapUrl[]): string {
	const xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">`;

	const xmlFooter = `
</urlset>`;

	const urlEntries = urls
		.map(
			(url) => `
  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`
		)
		.join('');

	return xmlHeader + urlEntries + xmlFooter;
}

function generateSitemap(): void {
	console.log('🗺️  Generating sitemap...');

	try {
		// Load blog context
		const blogContext = loadBlogContext();

		// Start with static URLs
		let allUrls = [...STATIC_URLS];

		// Add dynamic blog URLs if blog context is available
		if (blogContext) {
			const blogUrls = generateBlogUrls(blogContext);
			allUrls = allUrls.concat(blogUrls);
			console.log(`📝 Added ${blogUrls.length} blog URLs to sitemap`);
		} else {
			console.log('📝 No blog context found, using static URLs only');
		}

		// Sort URLs by priority (descending) then alphabetically
		allUrls.sort((a, b) => {
			const priorityDiff = parseFloat(b.priority) - parseFloat(a.priority);
			if (priorityDiff !== 0) return priorityDiff;
			return a.loc.localeCompare(b.loc);
		});

		// Generate XML
		const sitemapXml = generateSitemapXml(allUrls);

		// Write to static directory
		const outputPath = join(process.cwd(), 'static', 'sitemap.xml');
		writeFileSync(outputPath, sitemapXml);

		// Summary
		console.log('\n📊 Sitemap Summary:');
		console.log(`  🔗 Total URLs: ${allUrls.length}`);
		console.log(`  📄 Static pages: ${STATIC_URLS.length}`);

		if (blogContext) {
			const blogUrls = allUrls.length - STATIC_URLS.length;
			console.log(`  📝 Blog URLs: ${blogUrls}`);

			// Break down blog URLs
			const categoryUrls = Object.keys(blogContext.categories).length;
			const postUrls = blogUrls - categoryUrls;
			console.log(`    📁 Category pages: ${categoryUrls}`);
			console.log(`    📄 Blog posts: ${postUrls}`);
		}

		console.log(`  📁 Output: ${outputPath}`);
		console.log('\n✅ Sitemap generated successfully!');
	} catch (error) {
		console.error('❌ Failed to generate sitemap:');
		console.error(error);
		process.exit(1);
	}
}

// Run if called directly
// if (require.main === module) {
// 	generateSitemap();
// }
generateSitemap();
// export { generateSitemap };
