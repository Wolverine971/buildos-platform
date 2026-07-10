// apps/web/src/routes/skills/family/[family]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	buildPublicRuntimeSkill,
	loadAgentSkillIndex,
	resolveRuntimeSkillForPost
} from '$lib/server/agent-skills';
import { loadAgentSkillPosts } from '$lib/utils/blog';
import {
	buildDomainCards,
	buildPackCards,
	buildPostBySlug,
	groupSkillsByFamily
} from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params }) => {
	const [posts, catalog] = await Promise.all([loadAgentSkillPosts(), loadAgentSkillIndex()]);
	const family = groupSkillsByFamily(catalog.skills).find((item) => item.id === params.family);

	if (!family) {
		throw error(404, 'Skill family not found');
	}

	const postBySlug = buildPostBySlug(posts);
	const startSkill =
		family.skills.find((skill) => {
			const post = postBySlug.get(skill.slug);
			return post ? !resolveRuntimeSkillForPost(post)?.parentId : false;
		}) ?? family.skills[0];
	const catalogSkillByRuntimeId = new Map(
		catalog.skills
			.filter((skill) => Boolean(skill.runtime_skill_id))
			.map((skill) => [skill.runtime_skill_id as string, skill])
	);
	const previewByRuntimeId = new Map(
		catalog.previews.map((preview) => [preview.runtime_skill_id, preview])
	);
	const trees = family.skills.map((skill) => {
		const post = postBySlug.get(skill.slug);
		const runtime = post ? buildPublicRuntimeSkill(resolveRuntimeSkillForPost(post)) : null;
		return {
			skill,
			children:
				runtime?.child_skills.map((child) => ({
					...child,
					slug: catalogSkillByRuntimeId.get(child.id)?.slug,
					previewSlug: previewByRuntimeId.get(child.id)?.slug
				})) ?? []
		};
	});
	const familySlugs = new Set(family.skills.map((skill) => skill.slug));
	const domains = buildDomainCards(catalog.skills).filter((domain) =>
		domain.skills.some((skill) => familySlugs.has(skill.slug))
	);
	const packs = buildPackCards(catalog.skills).filter((pack) =>
		pack.skills.some((skill) => familySlugs.has(skill.slug))
	);

	return {
		family,
		startSkill,
		posts,
		trees,
		domains,
		packs,
		catalogVersion: catalog.version,
		totalSkills: catalog.skills.length
	};
};
