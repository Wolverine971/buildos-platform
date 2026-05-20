// apps/web/src/routes/agent-skills/+page.server.ts
import type { PageServerLoad } from './$types';
import {
	AGENT_SKILLS_CATEGORY_KEY,
	AGENT_SKILLS_COLLECTION,
	BLOG_CATEGORIES,
	loadAgentSkillPosts
} from '$lib/utils/blog';

export const load: PageServerLoad = async () => {
	const posts = await loadAgentSkillPosts();

	return {
		category: AGENT_SKILLS_COLLECTION,
		posts,
		allCategories: BLOG_CATEGORIES,
		categoryKey: AGENT_SKILLS_CATEGORY_KEY
	};
};
