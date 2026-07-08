// apps/web/src/routes/blogs/[category]/[slug]/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { AGENT_SKILLS_CATEGORY_KEY, loadBlogPostMetadata, getRelatedPosts } from '$lib/utils/blog';
import { renderBlogMarkdown } from '$lib/utils/markdown';

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

function countMarkdownWords(body: string): number {
	const text = body
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]*`/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/[^\p{L}\p{N}'-]+/gu, ' ')
		.trim();

	return text ? text.split(/\s+/).length : 0;
}

export const load: PageServerLoad = async ({ params, url }) => {
	const { category, slug } = params;

	if (category === AGENT_SKILLS_CATEGORY_KEY) {
		throw redirect(308, `/agent-skills/${slug}${url.search}`);
	}

	// Load only metadata (serializable)
	const post = await loadBlogPostMetadata(category, slug);
	const relatedPosts = await getRelatedPosts(category, slug, 3);
	const rawContent = blogContentModules[`/src/content/blogs/${post.category}/${post.slug}.md`];
	const contentMarkdown = rawContent ? stripLeadingH1(stripFrontmatter(rawContent)) : '';
	const contentHtml = contentMarkdown ? renderBlogMarkdown(contentMarkdown) : '';

	return {
		post,
		relatedPosts,
		contentHtml,
		wordCount: countMarkdownWords(contentMarkdown)
	};
};
