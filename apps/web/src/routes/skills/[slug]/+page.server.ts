// apps/web/src/routes/skills/[slug]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import {
	buildPublicRuntimeSkill,
	loadAgentSkillIndex,
	resolveRuntimeSkillForPost
} from '$lib/server/agent-skills';
import { loadAgentSkillPosts } from '$lib/utils/blog';
import {
	buildDomainDiscoveryCards,
	buildPackCards,
	getDomainPath
} from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params }) => {
	const [posts, catalog] = await Promise.all([loadAgentSkillPosts(), loadAgentSkillIndex()]);
	const skill = catalog.skills.find((item) => item.slug === params.slug);
	const post = posts.find((item) => item.slug === params.slug);

	if (!skill || !post) {
		const domain = buildDomainDiscoveryCards(catalog.skills, catalog.previews).find(
			(item) => item.id === params.slug
		);
		if (domain) {
			throw redirect(307, getDomainPath(domain));
		}
		throw error(404, 'Skill not found');
	}

	const skillBySlug = new Map(catalog.skills.map((item) => [item.slug, item]));
	const relatedSlugs = new Set<string>();
	for (const slug of [...(post.relatedSkills ?? []), ...(skill.stack_with ?? [])]) {
		if (skillBySlug.has(slug) && slug !== skill.slug) relatedSlugs.add(slug);
	}

	if (relatedSlugs.size === 0) {
		for (const candidate of catalog.skills) {
			if (candidate.slug === skill.slug) continue;
			if (candidate.skill_category === skill.skill_category) relatedSlugs.add(candidate.slug);
			if (relatedSlugs.size >= 3) break;
		}
	}

	const relatedSkills = Array.from(relatedSlugs)
		.map((slug) => skillBySlug.get(slug))
		.filter((item): item is typeof skill => Boolean(item))
		.slice(0, 4);
	const runtime = buildPublicRuntimeSkill(resolveRuntimeSkillForPost(post));
	const childSkills =
		runtime?.child_skills.map((child) => ({
			...child,
			slug: catalog.skills.find((candidate) => candidate.runtime_skill_id === child.id)?.slug
		})) ?? [];
	const containingPacks = buildPackCards(catalog.skills)
		.filter((pack) => pack.skills.some((item) => item.slug === skill.slug))
		.map((pack) => ({
			id: pack.id,
			name: pack.name,
			kind: pack.kind,
			job: pack.job,
			description: pack.description,
			order: pack.order,
			skills: pack.skills.map((item) => ({
				slug: item.slug,
				title: item.title
			}))
		}));

	return {
		skill,
		post,
		runtime,
		childSkills,
		relatedSkills,
		containingPacks,
		catalogVersion: catalog.version,
		totalSkills: catalog.skills.length
	};
};
