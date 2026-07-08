// apps/web/src/routes/skills/path/[path]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { loadAgentSkillPosts } from '$lib/utils/blog';
import { buildDomainCards, buildPackCards, groupSkillsByFamily } from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params }) => {
	const [posts, catalog] = await Promise.all([loadAgentSkillPosts(), loadAgentSkillIndex()]);
	const packs = buildPackCards(catalog.skills);
	const pack = packs.find((item) => item.id === params.path);

	if (!pack) {
		throw error(404, 'Skill path not found');
	}

	const packSkillSlugs = new Set(pack.skills.map((skill) => skill.slug));
	const domains = buildDomainCards(catalog.skills).filter((domain) =>
		domain.skills.some((skill) => packSkillSlugs.has(skill.slug))
	);
	const relatedPacks = packs
		.filter((candidate) => candidate.id !== pack.id)
		.map((candidate) => ({
			...candidate,
			overlapCount: candidate.skills.filter((skill) => packSkillSlugs.has(skill.slug)).length
		}))
		.filter((candidate) => candidate.overlapCount > 0)
		.sort((a, b) => b.overlapCount - a.overlapCount)
		.slice(0, 3);

	return {
		pack,
		posts,
		domains,
		relatedPacks,
		families: groupSkillsByFamily(pack.skills),
		catalogVersion: catalog.version,
		totalSkills: catalog.skills.length
	};
};
