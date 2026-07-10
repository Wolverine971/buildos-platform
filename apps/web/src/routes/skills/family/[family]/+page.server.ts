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
	domainGuides,
	getFamilyId,
	groupSkillsByFamily
} from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params }) => {
	const [posts, catalog] = await Promise.all([loadAgentSkillPosts(), loadAgentSkillIndex()]);
	const publicFamily = groupSkillsByFamily(catalog.skills).find(
		(item) => item.id === params.family
	);
	const familyPreviews = catalog.previews.filter(
		(preview) => getFamilyId(preview.family) === params.family
	);

	if (!publicFamily && !familyPreviews.length) {
		throw error(404, 'Skill family not found');
	}
	const family = publicFamily ?? {
		id: params.family,
		name: familyPreviews[0]?.family ?? params.family,
		skills: []
	};

	const postBySlug = buildPostBySlug(posts);
	const publicRootSkill =
		family.skills.find((skill) => {
			const post = postBySlug.get(skill.slug);
			return post ? !resolveRuntimeSkillForPost(post)?.parentId : false;
		}) ?? null;
	const preferredStartPreview = familyPreviews.find((preview) => preview.family_start) ?? null;
	const startPreview =
		preferredStartPreview ??
		(publicRootSkill ? null : (familyPreviews.find((preview) => !preview.parent_id) ?? null));
	const startSkill = startPreview ? null : (publicRootSkill ?? family.skills[0] ?? null);
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
	const linkedPreviewIds = new Set(
		trees.flatMap((tree) =>
			tree.children.filter((child) => Boolean(child.previewSlug)).map((child) => child.id)
		)
	);
	const standalonePreviews = familyPreviews.filter(
		(preview) => !linkedPreviewIds.has(preview.runtime_skill_id)
	);
	const familySlugs = new Set(family.skills.map((skill) => skill.slug));
	const domains = buildDomainCards(catalog.skills).filter((domain) =>
		domain.skills.some((skill) => familySlugs.has(skill.slug))
	);
	const previewDomainIds = new Set(familyPreviews.map((preview) => preview.domain_id));
	for (const domain of domainGuides) {
		if (!previewDomainIds.has(domain.id) || domains.some((item) => item.id === domain.id))
			continue;
		domains.push({ ...domain, skills: [] });
	}
	const packs = buildPackCards(catalog.skills).filter((pack) =>
		pack.skills.some((skill) => familySlugs.has(skill.slug))
	);

	return {
		family,
		startSkill,
		startPreview,
		posts,
		trees,
		previews: familyPreviews,
		standalonePreviews,
		domains,
		packs,
		catalogVersion: catalog.version,
		totalSkills: catalog.skills.length
	};
};
