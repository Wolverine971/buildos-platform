// apps/web/src/routes/skills/stacks/[stack]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { buildPackCards, getPackPath } from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params }) => {
	const catalog = await loadAgentSkillIndex();
	const stack = buildPackCards(catalog.skills).find(
		(item) => item.id === params.stack && item.kind === 'Stack'
	);

	if (!stack) {
		throw error(404, 'Skill stack not found');
	}

	throw redirect(307, getPackPath(stack));
};
