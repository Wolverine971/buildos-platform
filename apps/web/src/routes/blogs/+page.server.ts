// apps/web/src/routes/blogs/+page.server.ts
import type { PageServerLoad } from './$types';
import { loadBlogPosts, BLOG_CATEGORIES, type BlogCategory } from '$lib/utils/blog';

export const load: PageServerLoad = async () => {
	const allPosts = await loadBlogPosts();

	// Group posts by category, showing 5 latest per category unless <10 total posts
	const categorizedPosts: Record<string, typeof allPosts> = {};

	for (const categoryKey of Object.keys(BLOG_CATEGORIES)) {
		const categoryPosts = allPosts.filter((post) => post.category === categoryKey);

		// If total posts < 10, show all posts. Otherwise show 5 latest per category
		const postsToShow = allPosts.length < 10 ? categoryPosts : categoryPosts.slice(0, 5);

		categorizedPosts[categoryKey] = postsToShow;
	}

	return {
		categorizedPosts,
		categories: BLOG_CATEGORIES,
		totalPosts: allPosts.length
	};
};
