// apps/web/src/routes/blogs/[category]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	AGENT_SKILLS_CATEGORY_KEY,
	loadBlogPosts,
	BLOG_CATEGORIES,
	type BlogCategory
} from '$lib/utils/blog';

export const load: PageServerLoad = async ({ params, url }) => {
	const { category } = params;

	if (category === AGENT_SKILLS_CATEGORY_KEY) {
		throw redirect(308, `/agent-skills${url.search}`);
	}

	// Validate category exists
	if (!(category in BLOG_CATEGORIES)) {
		throw error(404, 'Category not found');
	}

	const allPosts = await loadBlogPosts();
	const posts = allPosts.filter((post) => post.category === category);

	// Published-post counts per category so the "Explore Other Categories" grid
	// can skip empty categories (otherwise it links crawlers/users into the
	// "No articles yet" empty state).
	const categoryCounts: Record<string, number> = {};
	for (const key of Object.keys(BLOG_CATEGORIES)) {
		categoryCounts[key] = allPosts.filter((p) => p.category === key).length;
	}

	return {
		category: BLOG_CATEGORIES[category as BlogCategory],
		posts,
		allCategories: BLOG_CATEGORIES,
		categoryCounts,
		categoryKey: category
	};
};
