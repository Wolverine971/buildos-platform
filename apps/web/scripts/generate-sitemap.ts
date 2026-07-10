// apps/web/scripts/generate-sitemap.ts
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { getFamilyId } from '../src/lib/skills/skill-gallery';
import {
	packDefinitions,
	previewSkillMetadataByRuntimeId,
	skillMetadataBySlug
} from '../src/lib/skills/skill-gallery-metadata';

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
	skillCategory?: string;
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

interface DocSection {
	slug: string;
	title: string;
	summary: string;
	icon: string;
	order: number;
}

interface DocsIndex {
	sections: DocSection[];
}

interface DocFrontmatter {
	lastUpdated?: string;
	sitemapChangefreq?: SitemapUrl['changefreq'];
	sitemapPriority?: string;
}

const BASE_URL = 'https://build-os.com';
const AGENT_SKILLS_CATEGORY_KEY = 'agent-skills';
const SKILL_GALLERY_LASTMOD = '2026-07-10';
// Use a static fallback date instead of today's date to avoid constantly changing dates
// This should be the date of the initial blog launch or earliest blog post
const DEFAULT_LASTMOD = '2025-10-05'; // Static fallback date for empty categories

// Static URLs from your existing sitemap
const STATIC_URLS: SitemapUrl[] = [
	{
		loc: `${BASE_URL}/`,
		lastmod: '2026-03-27',
		changefreq: 'weekly',
		priority: '1.0'
	},
	{
		loc: `${BASE_URL}/about`,
		lastmod: '2026-03-27',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/pricing`,
		lastmod: '2026-03-27',
		changefreq: 'weekly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/blogs`,
		lastmod: '2026-03-27',
		changefreq: 'weekly',
		priority: '0.7'
	},
	{
		loc: `${BASE_URL}/skills`,
		lastmod: SKILL_GALLERY_LASTMOD,
		changefreq: 'weekly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/contact`,
		lastmod: '2026-03-27',
		changefreq: 'monthly',
		priority: '0.6'
	},
	{
		loc: `${BASE_URL}/beta`,
		lastmod: '2026-03-27',
		changefreq: 'weekly',
		priority: '0.9'
	},
	{
		loc: `${BASE_URL}/road-map`,
		lastmod: '2026-03-27',
		changefreq: 'weekly',
		priority: '0.9'
	},
	{
		loc: `${BASE_URL}/help`,
		lastmod: '2026-03-27',
		changefreq: 'weekly',
		priority: '0.9'
	},
	{
		loc: `${BASE_URL}/investors`,
		lastmod: '2026-03-27',
		changefreq: 'monthly',
		priority: '0.6'
	},
	{
		loc: `${BASE_URL}/integrations`,
		lastmod: '2026-03-27',
		changefreq: 'monthly',
		priority: '0.7'
	},
	{
		loc: `${BASE_URL}/feedback`,
		lastmod: '2026-03-27',
		changefreq: 'monthly',
		priority: '0.7'
	},
	{
		loc: `${BASE_URL}/privacy`,
		lastmod: '2026-03-27',
		changefreq: 'monthly',
		priority: '0.5'
	},
	{
		loc: `${BASE_URL}/terms`,
		lastmod: '2026-03-27',
		changefreq: 'monthly',
		priority: '0.5'
	},
	{
		loc: `${BASE_URL}/docs`,
		lastmod: '2026-03-27',
		changefreq: 'weekly',
		priority: '0.7'
	},
	{
		loc: `${BASE_URL}/docs/getting-started`,
		lastmod: '2026-04-17',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/docs/ontology`,
		lastmod: '2026-04-17',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/docs/brain-dump`,
		lastmod: '2026-04-17',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/docs/agentic-chat`,
		lastmod: '2026-04-17',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/docs/projects-tasks-plans`,
		lastmod: '2026-04-17',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/docs/calendar`,
		lastmod: '2026-04-17',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/docs/daily-briefs`,
		lastmod: '2026-04-17',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/docs/notifications`,
		lastmod: '2026-04-17',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/docs/connect-agents`,
		lastmod: '2026-04-18',
		changefreq: 'monthly',
		priority: '0.8'
	},
	{
		loc: `${BASE_URL}/docs/reference`,
		lastmod: '2026-04-17',
		changefreq: 'monthly',
		priority: '0.7'
	}
];

function formatDateToYYYYMMDD(dateString: string): string {
	// If already in YYYY-MM-DD format, normalize padding and return directly
	// (avoids timezone bugs from new Date() interpreting YYYY-MM-DD as UTC midnight)
	const parts = dateString.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
	if (parts) {
		return `${parts[1]}-${parts[2].padStart(2, '0')}-${parts[3].padStart(2, '0')}`;
	}
	// Fallback for other date formats
	const date = new Date(dateString);
	const year = date.getUTCFullYear();
	const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
	const day = date.getUTCDate().toString().padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function loadDocsIndex(): DocsIndex | null {
	const docsIndexPath = join(process.cwd(), 'src', 'content', 'docs', '_index.json');

	if (!existsSync(docsIndexPath)) {
		console.warn('⚠️  docs _index.json not found. Using static docs URLs.');
		return null;
	}

	try {
		const content = readFileSync(docsIndexPath, 'utf-8');
		return JSON.parse(content);
	} catch (error) {
		console.error('❌ Failed to parse docs _index.json:', error);
		return null;
	}
}

function isChangefreq(value: unknown): value is SitemapUrl['changefreq'] {
	return (
		typeof value === 'string' &&
		['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'].includes(value)
	);
}

function normalizePriority(value: unknown): string | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value.toFixed(1);
	}
	if (typeof value === 'string' && value.trim()) {
		return value;
	}
	return undefined;
}

function readDocFrontmatter(slug: string): DocFrontmatter {
	const docPath = join(process.cwd(), 'src', 'content', 'docs', `${slug}.md`);

	if (!existsSync(docPath)) {
		console.warn(`⚠️  Docs markdown not found for '${slug}'. Falling back to static metadata.`);
		return {};
	}

	const content = readFileSync(docPath, 'utf-8');
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return {};

	try {
		const metadata = parseYaml(match[1] ?? '') as Record<string, unknown> | null;
		const lastUpdated = metadata?.lastUpdated;
		const sitemapChangefreq = metadata?.sitemapChangefreq;

		return {
			lastUpdated: typeof lastUpdated === 'string' ? lastUpdated : undefined,
			sitemapChangefreq: isChangefreq(sitemapChangefreq) ? sitemapChangefreq : undefined,
			sitemapPriority: normalizePriority(metadata?.sitemapPriority)
		};
	} catch (error) {
		console.warn(`⚠️  Failed to parse docs frontmatter for '${slug}':`, error);
		return {};
	}
}

function generateDocUrls(docsIndex: DocsIndex): SitemapUrl[] {
	return [...docsIndex.sections]
		.sort((a, b) => a.order - b.order)
		.map((section) => {
			const frontmatter = readDocFrontmatter(section.slug);
			const staticUrl = STATIC_URLS.find(
				(url) => url.loc === `${BASE_URL}/docs/${section.slug}`
			);

			return {
				loc: `${BASE_URL}/docs/${section.slug}`,
				lastmod: frontmatter.lastUpdated
					? formatDateToYYYYMMDD(frontmatter.lastUpdated)
					: (staticUrl?.lastmod ?? DEFAULT_LASTMOD),
				changefreq: frontmatter.sitemapChangefreq ?? staticUrl?.changefreq ?? 'monthly',
				priority:
					frontmatter.sitemapPriority ??
					staticUrl?.priority ??
					(section.slug === 'reference' ? '0.7' : '0.8')
			};
		});
}

function getMostRecentUrlDate(urls: SitemapUrl[]): string | null {
	return urls.reduce<string | null>((latest, url) => {
		if (!latest || url.lastmod > latest) return url.lastmod;
		return latest;
	}, null);
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

	Object.entries(blogContext.categories).forEach(([categoryKey, category]) => {
		if (categoryKey === AGENT_SKILLS_CATEGORY_KEY) return;

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
		const collectionPath =
			categoryKey === AGENT_SKILLS_CATEGORY_KEY ? '/agent-skills' : `/blogs/${categoryKey}`;

		// Only add category page if it has published posts
		if (mostRecentPostDate) {
			urls.push({
				loc: `${BASE_URL}${collectionPath}`,
				lastmod: mostRecentPostDate,
				changefreq: 'weekly',
				priority: categoryKey === AGENT_SKILLS_CATEGORY_KEY ? '0.7' : '0.6'
			});

			console.log(`📅 Collection '${collectionPath}' lastmod set to: ${mostRecentPostDate}`);
		} else {
			console.log(`⏩ Skipping category '${categoryKey}' - no published posts`);
		}
	});

	// Add individual blog post pages
	Object.entries(blogContext.categories).forEach(([categoryKey, category]) => {
		Object.entries(category.posts).forEach(([slug, post]) => {
			if (post && post.published) {
				const postLastMod = getPostLastMod(post);
				const postPath =
					categoryKey === AGENT_SKILLS_CATEGORY_KEY
						? `/agent-skills/${slug}`
						: `/blogs/${categoryKey}/${slug}`;

				urls.push({
					loc: `${BASE_URL}${postPath}`,
					lastmod: postLastMod,
					changefreq: (post.changefreq as any) || 'monthly',
					priority: post.priority || '0.6'
				});
			}
		});
	});

	return urls;
}

function generateSkillGalleryUrls(blogContext: BlogContext): SitemapUrl[] {
	const posts = Object.entries(blogContext.categories[AGENT_SKILLS_CATEGORY_KEY]?.posts ?? {})
		.map(([slug, post]) => (post?.published ? { ...post, slug } : null))
		.filter((post): post is BlogPost => Boolean(post));
	const urls: SitemapUrl[] = posts.map((post) => ({
		loc: `${BASE_URL}/skills/${post.slug}`,
		lastmod: SKILL_GALLERY_LASTMOD,
		changefreq: 'monthly',
		priority: '0.8'
	}));

	for (const runtimeSkillId of Object.keys(previewSkillMetadataByRuntimeId)) {
		urls.push({
			loc: `${BASE_URL}/skills/preview/${runtimeSkillId.replace(/_/g, '-')}`,
			lastmod: SKILL_GALLERY_LASTMOD,
			changefreq: 'monthly',
			priority: '0.6'
		});
	}

	const domainIds = new Set(
		posts
			.map((post) => post.skillCategory)
			.filter((domainId): domainId is string => Boolean(domainId))
	);
	for (const domainId of domainIds) {
		urls.push({
			loc: `${BASE_URL}/skills/domain/${domainId}`,
			lastmod: SKILL_GALLERY_LASTMOD,
			changefreq: 'weekly',
			priority: '0.7'
		});
	}

	const familyNames = new Set(
		posts
			.map((post) => skillMetadataBySlug[post.slug]?.family)
			.filter((familyName): familyName is string => Boolean(familyName))
	);
	for (const familyName of familyNames) {
		urls.push({
			loc: `${BASE_URL}/skills/family/${getFamilyId(familyName)}`,
			lastmod: SKILL_GALLERY_LASTMOD,
			changefreq: 'weekly',
			priority: '0.7'
		});
	}

	const publishedSlugs = new Set(posts.map((post) => post.slug));
	for (const pack of packDefinitions) {
		if (!pack.slugs.some((slug) => publishedSlugs.has(slug))) continue;
		urls.push({
			loc: `${BASE_URL}/skills/path/${pack.id}`,
			lastmod: SKILL_GALLERY_LASTMOD,
			changefreq: 'monthly',
			priority: '0.7'
		});
	}

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
		const docsIndex = loadDocsIndex();

		// Start with static URLs
		let allUrls = docsIndex
			? STATIC_URLS.filter((url) => !url.loc.startsWith(`${BASE_URL}/docs/`))
			: [...STATIC_URLS];
		const staticUrlCount = allUrls.length;
		let docUrlCount = 0;
		let blogUrlCount = 0;
		let skillGalleryUrlCount = 0;

		if (docsIndex) {
			const docUrls = generateDocUrls(docsIndex);
			const mostRecentDocDate = getMostRecentUrlDate(docUrls);
			const docsRootUrl = allUrls.find((url) => url.loc === `${BASE_URL}/docs`);

			if (docsRootUrl && mostRecentDocDate) {
				docsRootUrl.lastmod = mostRecentDocDate;
				console.log(`📅 Updated docs page lastmod to: ${mostRecentDocDate}`);
			}

			allUrls = allUrls.concat(docUrls);
			docUrlCount = docUrls.length;
			console.log(`📚 Added ${docUrls.length} docs URLs to sitemap`);
		}

		// Add dynamic blog URLs if blog context is available
		if (blogContext) {
			const blogUrls = generateBlogUrls(blogContext);
			const skillGalleryUrls = generateSkillGalleryUrls(blogContext);
			allUrls = allUrls.concat(blogUrls, skillGalleryUrls);
			blogUrlCount = blogUrls.length;
			skillGalleryUrlCount = skillGalleryUrls.length;
			console.log(`📝 Added ${blogUrls.length} blog URLs to sitemap`);
			console.log(`🧠 Added ${skillGalleryUrls.length} skill gallery URLs to sitemap`);
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
		console.log(`  📄 Static pages: ${staticUrlCount}`);
		console.log(`  📚 Docs URLs: ${docUrlCount}`);
		console.log(`  🧠 Skill gallery URLs: ${skillGalleryUrlCount}`);

		if (blogContext) {
			console.log(`  📝 Blog URLs: ${blogUrlCount}`);

			// Break down blog URLs
			const categoryUrls = Object.keys(blogContext.categories).length;
			const postUrls = blogUrlCount - categoryUrls;
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
