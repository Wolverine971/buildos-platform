// apps/web/src/routes/blog/[slug]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadBlogPosts } from '$lib/utils/blog';

export const load: PageServerLoad = async ({ params, url }) => {
	const slug = params.slug?.replace(/\.md$/i, '');
	if (!slug) {
		throw error(404, 'Post not found');
	}

	const posts = await loadBlogPosts();
	const post = posts.find((candidate) => candidate.slug === slug);
	if (!post) {
		throw error(404, 'Post not found');
	}

	throw redirect(308, `/blogs/${post.category}/${post.slug}${url.search}`);
};
