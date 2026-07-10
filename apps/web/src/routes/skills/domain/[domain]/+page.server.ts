// apps/web/src/routes/skills/domain/[domain]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { loadAgentSkillPosts } from '$lib/utils/blog';
import {
	buildDomainDiscoveryCards,
	buildPackCards,
	getFamilyId,
	groupSkillsByFamily
} from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params }) => {
	const [posts, catalog] = await Promise.all([loadAgentSkillPosts(), loadAgentSkillIndex()]);
	const domain = buildDomainDiscoveryCards(catalog.skills, catalog.previews).find(
		(item) => item.id === params.domain
	);

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
	const featuredPreview =
		domain.previews.find(
			(preview) => preview.runtime_skill_id === domain.startPreviewRuntimeId
		) ??
		domain.previews.find((preview) => preview.family_start) ??
		domain.previews.find((preview) => !preview.parent_id) ??
		domain.previews[0] ??
		null;
	const previewFamilyNames = [...new Set(domain.previews.map((preview) => preview.family))];
	const previewFamilies = previewFamilyNames.map((name) => ({
		id: getFamilyId(name),
		name,
		previews: domain.previews
			.filter((preview) => preview.family === name)
			.sort(
				(left, right) =>
					Number(Boolean(right.family_start)) - Number(Boolean(left.family_start))
			)
	}));
	const families = groupSkillsByFamily(domain.skills);
	const familyCount = new Set([...families.map((family) => family.name), ...previewFamilyNames])
		.size;

	return {
		domain,
		posts,
		packs,
		featuredSkill,
		featuredPreview,
		families,
		previewFamilies,
		familyCount,
		catalogVersion: catalog.version,
		totalSkills: catalog.skills.length
	};
};
