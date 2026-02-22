// apps/web/src/routes/blogs/[category]/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { loadBlogPostMetadata, getRelatedPosts } from '$lib/utils/blog';

export const load: PageServerLoad = async ({ params }) => {
	const { category, slug } = params;

	// Load only metadata (serializable)
	const post = await loadBlogPostMetadata(category, slug);
	const relatedPosts = await getRelatedPosts(category, slug, 3);

	return {
		post,
		relatedPosts
	};
};
