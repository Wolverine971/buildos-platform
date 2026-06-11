import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAgentSkillReference } from '$lib/server/agent-skills';
import { AGENT_SKILLS_CATEGORY_KEY, loadBlogPostMetadata } from '$lib/utils/blog';

export const GET: RequestHandler = async ({ params }) => {
	const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, params.slug);
	const result = getAgentSkillReference(post, params.path);

	if (!result) {
		throw error(404, 'Skill reference not found');
	}

	return new Response(result.content, {
		headers: {
			'content-type': result.contentType,
			'cache-control': 'public, max-age=300',
			'x-buildos-runtime-skill-id': result.runtimeSkillId,
			'x-buildos-reference-id': result.referenceId
		}
	});
};
