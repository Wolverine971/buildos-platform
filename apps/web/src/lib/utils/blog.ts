// apps/web/src/lib/utils/blog.ts
import { error } from '@sveltejs/kit';

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
		name: 'Case Studies',
		description: 'Real user stories and success examples',
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
		const slug = filename.replace('.md', '');

		if (module && typeof module === 'object' && 'metadata' in module) {
			const metadata = module.metadata as BlogPost;

			if (metadata.published) {
				// Calculate reading time from the module's default export
				let readingTime = 5; // default
				const mod = module as { default?: unknown; metadata: any };
				if (mod.default && typeof mod.default === 'object') {
					try {
						readingTime =
							metadata.readingTime ||
							calculateReadingTime(JSON.stringify(mod.default));
					} catch (e) {
						readingTime = metadata.readingTime || 5;
					}
				} else {
					readingTime = metadata.readingTime || 5;
				}

				posts.push({
					slug,
					category,
					readingTime,
					title: metadata.title,
					description: metadata.description,
					author: metadata.author,
					date: metadata.date,
					lastmod: metadata.lastmod,
					changefreq: metadata.changefreq,
					priority: metadata.priority,
					published: metadata.published,
					tags: metadata.tags || [],
					pic: metadata.pic,
					excerpt: metadata.excerpt || metadata.description
				});
			}
		}
	}

	return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

	if (typeof module !== 'object' || !('metadata' in module)) {
		throw error(404, 'Invalid post format');
	}

	const metadata = module.metadata as any;

	if (!metadata?.published) {
		throw error(404, 'Post not found');
	}

	// Calculate reading time
	let readingTime = metadata.readingTime || 5;
	if (module.default) {
		try {
			readingTime = metadata.readingTime || calculateReadingTime(metadata.description || '');
		} catch (e) {
			readingTime = metadata.readingTime || 5;
		}
	}

	return {
		slug,
		category,
		readingTime,
		title: metadata.title,
		description: metadata.description,
		author: metadata.author,
		date: metadata.date,
		lastmod: metadata.lastmod,
		changefreq: metadata.changefreq,
		priority: metadata.priority,
		published: metadata.published,
		tags: metadata.tags || [],
		pic: metadata.pic,
		excerpt: metadata.excerpt || metadata.description
	};
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
