// apps/web/src/routes/agent-skills/+page.server.ts
import type { PageServerLoad } from './$types';
import {
	AGENT_SKILLS_CATEGORY_KEY,
	AGENT_SKILLS_COLLECTION,
	BLOG_CATEGORIES,
	loadAgentSkillPosts
} from '$lib/utils/blog';
import { getPortableAgentSkillName, loadAgentSkillIndex } from '$lib/server/agent-skills';

export const load: PageServerLoad = async () => {
	const [posts, catalog] = await Promise.all([loadAgentSkillPosts(), loadAgentSkillIndex()]);

	// SKILL.md name per slug: also the folder the bundle unzips into (see SkillInstallSteps).
	const skillNames: Record<string, string> = Object.fromEntries(
		posts.map((post) => [post.slug, getPortableAgentSkillName(post)])
	);

	return {
		category: AGENT_SKILLS_COLLECTION,
		posts,
		catalog,
		skillNames,
		allCategories: BLOG_CATEGORIES,
		categoryKey: AGENT_SKILLS_CATEGORY_KEY
	};
};
