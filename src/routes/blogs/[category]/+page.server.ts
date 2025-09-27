// src/routes/blogs/[category]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadBlogPostsByCategory, BLOG_CATEGORIES, type BlogCategory } from '$lib/utils/blog';

export const load: PageServerLoad = async ({ params }) => {
	const { category } = params;

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
