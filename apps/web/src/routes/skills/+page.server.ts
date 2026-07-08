// apps/web/src/routes/skills/+page.server.ts
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { loadAgentSkillPosts } from '$lib/utils/blog';

export const load: PageServerLoad = async () => {
	const [posts, catalog] = await Promise.all([loadAgentSkillPosts(), loadAgentSkillIndex()]);

	return {
		posts,
		catalog
	};
};
