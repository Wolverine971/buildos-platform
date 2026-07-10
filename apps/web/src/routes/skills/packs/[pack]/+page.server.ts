// apps/web/src/routes/skills/packs/[pack]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { buildPackCards, getPackPath } from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params }) => {
	const catalog = await loadAgentSkillIndex();
	const pack = buildPackCards(catalog.skills).find(
		(item) => item.id === params.pack && item.kind === 'Pack'
	);

	if (!pack) {
		throw error(404, 'Skill pack not found');
	}

	throw redirect(307, getPackPath(pack));
};
