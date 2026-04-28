// apps/web/src/lib/utils/blog.ts
import { error } from '@sveltejs/kit';
import { format, isValid, parseISO } from 'date-fns';

export interface BlogFaqItem {
	q: string;
	a: string;
}

export interface BlogPost {
	slug: string;
	category: string;
	title: string;
	description: string;
	author: string;
	date: string;
	lastmod: string;
	changefreq: string;
	priority: string;
	published: boolean;
	tags: string[];
	readingTime: number;
	pic?: string;
	excerpt?: string;
	faq?: BlogFaqItem[];
	skillId?: string;
	skillType?: string;
	skillCategory?: string;
	providers?: string[];
	compatibleAgents?: string[];
	stackWith?: string[];
	skillSource?: string;
	installHint?: string;
}

type BlogModule = {
	default?: unknown;
	metadata?: unknown;
};

type BlogMetadata = Partial<BlogPost> &
	Record<string, unknown> & {
		readingTime?: unknown;
		faq?: unknown;
	};

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isBlogModule(module: unknown): module is BlogModule & { metadata: BlogMetadata } {
	return typeof module === 'object' && module !== null && 'metadata' in module;
}

function isBlogFaqItem(value: unknown): value is BlogFaqItem {
	if (typeof value !== 'object' || value === null) return false;

	const candidate = value as Record<string, unknown>;
	return typeof candidate.q === 'string' && typeof candidate.a === 'string';
}

export function parseBlogDate(value: unknown): Date | null {
	if (value instanceof Date) {
		return isValid(value) ? value : null;
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;

		const parsed =
			DATE_ONLY_PATTERN.test(trimmed) || trimmed.includes('T') || trimmed.includes('Z')
				? parseISO(trimmed)
				: new Date(trimmed);

		return isValid(parsed) ? parsed : null;
	}

	if (typeof value === 'number') {
		const parsed = new Date(value);
		return isValid(parsed) ? parsed : null;
	}

	return null;
}

function normalizeBlogDateString(value: unknown): string | null {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return parseBlogDate(trimmed) ? trimmed : null;
	}

	const parsed = parseBlogDate(value);
	return parsed ? format(parsed, 'yyyy-MM-dd') : null;
}

export function formatBlogDate(
	value: unknown,
	pattern = 'MMM dd, yyyy',
	fallback = 'Date unavailable'
): string {
	const parsed = parseBlogDate(value);
	return parsed ? format(parsed, pattern) : fallback;
}

function getBlogSortTimestamp(date: unknown, lastmod: unknown): number {
	return parseBlogDate(date)?.getTime() ?? parseBlogDate(lastmod)?.getTime() ?? 0;
}

function warnInvalidBlogDate(path: string, date: unknown, lastmod: unknown) {
	console.warn('Blog post has invalid date metadata', {
		path,
		date,
		lastmod
	});
}

function calculateModuleReadingTime(module: BlogModule, metadata: BlogMetadata): number {
	const explicitReadingTime =
		typeof metadata.readingTime === 'number' ? metadata.readingTime : null;
	if (explicitReadingTime) return explicitReadingTime;

	if (module.default && typeof module.default === 'object') {
		try {
			return calculateReadingTime(JSON.stringify(module.default));
		} catch {
			return 5;
		}
	}

	return 5;
}

function normalizeStringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;

	const normalized = value.filter((item): item is string => typeof item === 'string');
	return normalized.length > 0 ? normalized : undefined;
}

function buildBlogPost(
	path: string,
	slug: string,
	category: string,
	module: BlogModule & { metadata: BlogMetadata }
): BlogPost | null {
	const metadata = module.metadata;

	if (metadata.published !== true) {
		return null;
	}

	const normalizedDate =
		normalizeBlogDateString(metadata.date) ?? normalizeBlogDateString(metadata.lastmod) ?? '';
	const normalizedLastmod = normalizeBlogDateString(metadata.lastmod) ?? normalizedDate;

	if (!normalizedDate) {
		warnInvalidBlogDate(path, metadata.date, metadata.lastmod);
	}

	const description = typeof metadata.description === 'string' ? metadata.description : '';
	const tags = Array.isArray(metadata.tags)
		? metadata.tags.filter((tag): tag is string => typeof tag === 'string')
		: [];
	const faq = Array.isArray(metadata.faq)
		? metadata.faq.filter((item): item is BlogFaqItem => isBlogFaqItem(item))
		: undefined;

	return {
		slug,
		category,
		readingTime: calculateModuleReadingTime(module, metadata),
		title: typeof metadata.title === 'string' ? metadata.title : slug,
		description,
		author: typeof metadata.author === 'string' ? metadata.author : 'BuildOS Team',
		date: normalizedDate,
		lastmod: normalizedLastmod,
		changefreq: typeof metadata.changefreq === 'string' ? metadata.changefreq : 'monthly',
		priority: typeof metadata.priority === 'string' ? metadata.priority : '0.7',
		published: true,
		tags,
		pic: typeof metadata.pic === 'string' ? metadata.pic : undefined,
		excerpt: typeof metadata.excerpt === 'string' ? metadata.excerpt : description,
		faq,
		skillId: typeof metadata.skillId === 'string' ? metadata.skillId : undefined,
		skillType: typeof metadata.skillType === 'string' ? metadata.skillType : undefined,
		skillCategory:
			typeof metadata.skillCategory === 'string' ? metadata.skillCategory : undefined,
		providers: normalizeStringArray(metadata.providers),
		compatibleAgents: normalizeStringArray(metadata.compatibleAgents),
		stackWith: normalizeStringArray(metadata.stackWith),
		skillSource: typeof metadata.skillSource === 'string' ? metadata.skillSource : undefined,
		installHint: typeof metadata.installHint === 'string' ? metadata.installHint : undefined
	};
}

export const BLOG_CATEGORIES = {
	'getting-started': {
		name: 'Getting Started',
		description: 'Essential guides to help you master BuildOS fundamentals',
		color: 'purple'
	},
	'productivity-tips': {
		name: 'Productivity Tips',
		description: 'Optimize your workflow and boost your efficiency',
		color: 'blue'
	},
	'product-updates': {
		name: 'Product Updates',
		description: 'Latest features, improvements, and announcements',
		color: 'green'
	},
	'case-studies': {
		name: 'Comparisons',
		description: 'How BuildOS stacks up against other tools',
		color: 'orange'
	},
	'advanced-guides': {
		name: 'Advanced Guides',
		description: 'Deep-dive tutorials for power users',
		color: 'red'
	},
	philosophy: {
		name: 'Philosophy',
		description: 'Our vision for the future of personal productivity',
		color: 'indigo'
	},
	'agent-skills': {
		name: 'Agent Skills',
		description: 'Portable skill guides, definitions, and operating playbooks for AI agents.',
		color: 'cyan'
	}
} as const;

export type BlogCategory = keyof typeof BLOG_CATEGORIES;

// Calculate estimated reading time based on word count
export function calculateReadingTime(content: string): number {
	const wordsPerMinute = 200;
	const wordCount = content.split(/\s+/).length;
	return Math.ceil(wordCount / wordsPerMinute);
}

// Load all blog posts using import.meta.glob (Vite-compatible)
export async function loadBlogPosts(): Promise<BlogPost[]> {
	const modules = import.meta.glob('/src/content/blogs/**/*.md', { eager: true });
	const posts: BlogPost[] = [];

	for (const [path, module] of Object.entries(modules)) {
		const pathParts = path.split('/');
		const filename = pathParts[pathParts.length - 1];
		const category = pathParts[pathParts.length - 2];

		// Skip if filename is undefined
		if (!filename || !category) continue;

		const slug = filename.replace('.md', '');

		if (!isBlogModule(module)) continue;

		const post = buildBlogPost(path, slug, category, module);
		if (post) posts.push(post);
	}

	return posts.sort(
		(a, b) => getBlogSortTimestamp(b.date, b.lastmod) - getBlogSortTimestamp(a.date, a.lastmod)
	);
}

// Load posts by category
export async function loadBlogPostsByCategory(category: BlogCategory): Promise<BlogPost[]> {
	const allPosts = await loadBlogPosts();
	return allPosts.filter((post) => post.category === category);
}

// Load a specific blog post metadata only (without content)
export async function loadBlogPostMetadata(category: string, slug: string): Promise<BlogPost> {
	const modules = import.meta.glob('/src/content/blogs/**/*.md', { eager: true });
	const modulePath = `/src/content/blogs/${category}/${slug}.md`;
	const module = modules[modulePath];

	if (!module) {
		throw error(404, 'Post not found');
	}

	if (!isBlogModule(module)) {
		throw error(404, 'Invalid post format');
	}

	const post = buildBlogPost(modulePath, slug, category, module);
	if (!post) {
		throw error(404, 'Post not found');
	}

	return post;
}

// Get related posts (same category, excluding current post)
export async function getRelatedPosts(
	category: string,
	currentSlug: string,
	limit = 3
): Promise<BlogPost[]> {
	const categoryPosts = await loadBlogPostsByCategory(category as BlogCategory);
	return categoryPosts.filter((post) => post.slug !== currentSlug).slice(0, limit);
}

// Search posts by title, description, or tags
export async function searchBlogPosts(query: string): Promise<BlogPost[]> {
	const allPosts = await loadBlogPosts();
	const searchTerm = query.toLowerCase();

	return allPosts.filter(
		(post) =>
			post.title.toLowerCase().includes(searchTerm) ||
			post.description.toLowerCase().includes(searchTerm) ||
			post.tags.some((tag) => tag.toLowerCase().includes(searchTerm))
	);
}
