// apps/web/src/routes/skills/domain/[domain]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { loadAgentSkillPosts } from '$lib/utils/blog';
import { buildDomainCards, buildPackCards, groupSkillsByFamily } from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params }) => {
	const [posts, catalog] = await Promise.all([loadAgentSkillPosts(), loadAgentSkillIndex()]);
	const domain = buildDomainCards(catalog.skills).find((item) => item.id === params.domain);

	if (!domain) {
		throw error(404, 'Skill domain not found');
	}

	const domainSkillSlugs = new Set(domain.skills.map((skill) => skill.slug));
	const packs = buildPackCards(catalog.skills)
		.filter((pack) => pack.skills.some((skill) => domainSkillSlugs.has(skill.slug)))
		.map((pack) => ({
			id: pack.id,
			name: pack.name,
			kind: pack.kind,
			job: pack.job,
			description: pack.description,
			order: pack.order,
			skills: pack.skills.filter((skill) => domainSkillSlugs.has(skill.slug))
		}));
	const featuredSkill =
		domain.skills.find((skill) => skill.slug === domain.startSlug) ?? domain.skills[0] ?? null;

	return {
		domain,
		posts,
		packs,
		featuredSkill,
		families: groupSkillsByFamily(domain.skills),
		catalogVersion: catalog.version,
		totalSkills: catalog.skills.length
	};
};
