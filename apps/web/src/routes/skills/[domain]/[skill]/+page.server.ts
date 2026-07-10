// apps/web/src/routes/skills/[domain]/[skill]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { getSkillPath } from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params }) => {
	const catalog = await loadAgentSkillIndex();
	const skill = catalog.skills.find(
		(item) => item.slug === params.skill && item.skill_category === params.domain
	);

	if (!skill) {
		throw error(404, 'Skill not found in this domain');
	}

	throw redirect(307, getSkillPath(skill));
};
