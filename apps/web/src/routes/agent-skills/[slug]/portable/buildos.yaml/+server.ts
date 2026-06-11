import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPortableAgentSkillFile } from '$lib/server/agent-skills';
import { AGENT_SKILLS_CATEGORY_KEY, loadBlogPostMetadata } from '$lib/utils/blog';

export const GET: RequestHandler = async ({ params }) => {
	const post = await loadBlogPostMetadata(AGENT_SKILLS_CATEGORY_KEY, params.slug);
	const result = getPortableAgentSkillFile(post, 'buildos.yaml');

	if (!result) {
		throw error(404, 'BuildOS metadata not found');
	}

	return new Response(result.content, {
		headers: {
			'content-type': result.contentType,
			'cache-control': 'public, max-age=300'
		}
	});
};
