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

function stripLeadingH1(body: string): string {
	// The page already renders the post title as an H1. If the markdown body
	// opens with its own H1 (or setext underline-style H1), drop it so we don't
	// render the title twice.
	const atxStripped = body.replace(/^\s{0,3}#\s+[^\n]*\n+/, '');
	if (atxStripped !== body) return atxStripped;
	return body.replace(/^[^\n]+\n=+\s*\n+/, '');
}

export const load: PageServerLoad = async ({ params }) => {
	const { category, slug } = params;

	// Load only metadata (serializable)
	const post = await loadBlogPostMetadata(category, slug);
	const relatedPosts = await getRelatedPosts(category, slug, 3);
	const rawContent = blogContentModules[`/src/content/blogs/${post.category}/${post.slug}.md`];
	const contentHtml = rawContent
		? renderMarkdown(stripLeadingH1(stripFrontmatter(rawContent)))
		: '';

	return {
		post,
		relatedPosts,
		contentHtml
	};
};
