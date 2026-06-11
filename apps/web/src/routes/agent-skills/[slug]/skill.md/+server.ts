import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAgentSkillMarkdown } from '$lib/server/agent-skills';
import { AGENT_SKILLS_CATEGORY_KEY, loadBlogPostMetadata } from '$lib/utils/blog';

export const GET: RequestHandler = async ({ params }) => {
	const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, params.slug);
	const result = getAgentSkillMarkdown(post);

	if (!result) {
		throw error(404, 'Skill markdown not found');
	}

	return new Response(result.content, {
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'cache-control': 'public, max-age=300',
			'x-buildos-skill-source': result.source,
			...(result.runtimeSkillId ? { 'x-buildos-runtime-skill-id': result.runtimeSkillId } : {})
		}
	});
};
