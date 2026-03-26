// apps/web/src/routes/blogs/+page.server.ts
import type { PageServerLoad } from './$types';
import { loadBlogPosts, BLOG_CATEGORIES } from '$lib/utils/blog';

export const load: PageServerLoad = async ({ url }) => {
	const allPosts = await loadBlogPosts();
	const initialQuery = url.searchParams.get('q')?.trim() ?? '';

	// Group posts by category, showing 5 latest per category unless <10 total posts
	const categorizedPosts: Record<string, typeof allPosts> = {};

	for (const categoryKey of Object.keys(BLOG_CATEGORIES)) {
		const categoryPosts = allPosts.filter((post) => post.category === categoryKey);

		// If total posts < 10, show all posts. Otherwise show 5 latest per category
		const postsToShow = allPosts.length < 10 ? categoryPosts : categoryPosts.slice(0, 5);

		categorizedPosts[categoryKey] = postsToShow;
	}

	return {
		allPosts,
		categorizedPosts,
		categories: BLOG_CATEGORIES,
		totalPosts: allPosts.length,
		initialQuery
	};
};
