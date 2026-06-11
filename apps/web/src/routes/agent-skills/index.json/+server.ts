import { json } from '@sveltejs/kit';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';

export const GET = async () => {
	const index = await loadAgentSkillIndex();

	return json(index, {
		headers: {
			'cache-control': 'public, max-age=300'
		}
	});
};
