// apps/web/src/routes/agent-skills/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { AGENT_SKILLS_CATEGORY_KEY, getRelatedPosts, loadBlogPostMetadata } from '$lib/utils/blog';
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
	const atxStripped = body.replace(/^\s{0,3}#\s+[^\n]*\n+/, '');
	if (atxStripped !== body) return atxStripped;
	return body.replace(/^[^\n]+\n=+\s*\n+/, '');
}

export const load: PageServerLoad = async ({ params }) => {
	const { slug } = params;

	const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, slug);
	const relatedPosts = await getRelatedPosts(AGENT_SKILLS_CATEGORY_KEY, slug, 3);
	const rawContent =
		blogContentModules[`/src/content/blogs/${AGENT_SKILLS_CATEGORY_KEY}/${post.slug}.md`];
	const contentHtml = rawContent
		? renderMarkdown(stripLeadingH1(stripFrontmatter(rawContent)))
		: '';

	return {
		post,
		relatedPosts,
		contentHtml
	};
};
