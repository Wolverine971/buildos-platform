// apps/web/src/routes/skills/people/[slug]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import {
	getSkillExpertBySlug,
	getSkillExpertLineageRelationship,
	normalizeSkillExpertName
} from '$lib/skills/skill-experts';
import { loadAgentSkillPosts } from '$lib/utils/blog';

export const load: PageServerLoad = async ({ params }) => {
	const expert = getSkillExpertBySlug(params.slug);
	if (!expert) throw error(404, 'Skill expert not found');

	const [posts, catalog] = await Promise.all([loadAgentSkillPosts(), loadAgentSkillIndex()]);
	const expertKey = normalizeSkillExpertName(expert.name);
	const relatedPosts = posts.filter((post) =>
		post.lineagePeople?.some((name) => normalizeSkillExpertName(name) === expertKey)
	);
	const skillBySlug = new Map(catalog.skills.map((skill) => [skill.slug, skill]));
	const relatedSkills = relatedPosts
		.map((post) => {
			const skill = skillBySlug.get(post.slug);
			if (!skill) return null;

			return {
				slug: skill.slug,
				title: skill.gallery.display_title,
				description: skill.description,
				sourceCount:
					post.lineageSources?.filter((source) =>
						getSkillExpertLineageRelationship(expert, source)
					).length ?? 0
			};
		})
		.filter((skill): skill is NonNullable<typeof skill> => Boolean(skill));

	const seenSources = new Set<string>();
	const reviewedSources = relatedPosts
		.flatMap((post) =>
			(post.lineageSources ?? []).flatMap((source) => {
				const relationship = getSkillExpertLineageRelationship(expert, source);
				if (!relationship) return [];

				return [
					{
						title: source.title,
						url: source.url,
						sourceType: source.sourceType,
						creator: source.creator,
						channelName: source.channelName,
						relationship,
						skillSlug: post.slug,
						skillTitle: skillBySlug.get(post.slug)?.gallery.display_title ?? post.title
					}
				];
			})
		)
		.filter((source) => {
			const key = source.url ?? `${source.skillSlug}:${source.title}`;
			if (seenSources.has(key)) return false;
			seenSources.add(key);
			return true;
		});

	return {
		expert,
		relatedSkills,
		reviewedSources
	};
};
