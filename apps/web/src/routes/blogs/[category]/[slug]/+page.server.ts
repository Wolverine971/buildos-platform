// apps/web/src/routes/blogs/[category]/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { loadBlogPostMetadata, getRelatedPosts } from '$lib/utils/blog';
import { renderMarkdown } from '$lib/utils/markdown';

const blogContentModules = import.meta.glob<string>('/src/content/blogs/**/*.md', {
	eager: true,
	query: '?raw',
	import: 'default'
});

function stripFrontmatter(content: string): string {
	return content.replace(/^---\s*\n[\s\S]*?\n---\s*/, '').trim();
}

export const load: PageServerLoad = async ({ params }) => {
	const { category, slug } = params;

	// Load only metadata (serializable)
	const post = await loadBlogPostMetadata(category, slug);
	const relatedPosts = await getRelatedPosts(category, slug, 3);
	const rawContent = blogContentModules[`/src/content/blogs/${post.category}/${post.slug}.md`];
	const contentHtml = rawContent ? renderMarkdown(stripFrontmatter(rawContent)) : '';

	return {
		post,
		relatedPosts,
		contentHtml
	};
};
