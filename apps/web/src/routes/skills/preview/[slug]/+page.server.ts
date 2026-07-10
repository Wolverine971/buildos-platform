import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { domainGuides } from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params }) => {
	const catalog = await loadAgentSkillIndex();
	const preview = catalog.previews.find((item) => item.slug === params.slug);

	if (!preview) {
		throw error(404, 'Skill preview not found');
	}

	return {
		preview,
		domain: domainGuides.find((item) => item.id === preview.domain_id) ?? null,
		relatedPreviews: catalog.previews.filter(
			(item) => item.slug !== preview.slug && item.family === preview.family
		),
		coverage: catalog.coverage,
		catalogVersion: catalog.version
	};
};
