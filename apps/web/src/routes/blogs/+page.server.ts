// apps/web/src/routes/blogs/+page.server.ts
import type { PageServerLoad } from './$types';
import { AGENT_SKILLS_CATEGORY_KEY, loadBlogPosts, BLOG_CATEGORIES } from '$lib/utils/blog';

export const load: PageServerLoad = async () => {
	const allPosts = (await loadBlogPosts()).filter(
		(post) => post.category !== AGENT_SKILLS_CATEGORY_KEY
	);

	// Count posts per category (for filter pill counts)
	const categoryCounts: Record<string, number> = {};
	for (const key of Object.keys(BLOG_CATEGORIES)) {
		categoryCounts[key] = allPosts.filter((p) => p.category === key).length;
	}

	return {
		allPosts,
		categories: BLOG_CATEGORIES,
		categoryCounts,
		totalPosts: allPosts.length
	};
};
