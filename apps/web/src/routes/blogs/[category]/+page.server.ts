// apps/web/src/routes/blogs/[category]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	AGENT_SKILLS_CATEGORY_KEY,
	loadBlogPostsByCategory,
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

	const posts = await loadBlogPostsByCategory(category as BlogCategory);

	return {
		category: BLOG_CATEGORIES[category as BlogCategory],
		posts,
		allCategories: BLOG_CATEGORIES,
		categoryKey: category
	};
};
