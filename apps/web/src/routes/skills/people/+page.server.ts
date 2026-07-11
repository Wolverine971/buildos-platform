// apps/web/src/routes/skills/people/+page.server.ts
import type { PageServerLoad } from './$types';
import {
	getSkillExpertLineageRelationship,
	normalizeSkillExpertName,
	skillExperts
} from '$lib/skills/skill-experts';
import { loadAgentSkillPosts } from '$lib/utils/blog';

export const load: PageServerLoad = async () => {
	const posts = await loadAgentSkillPosts();

	const experts = skillExperts.map((expert) => {
		const expertKey = normalizeSkillExpertName(expert.name);
		const relatedPosts = posts.filter((post) =>
			post.lineagePeople?.some((name) => normalizeSkillExpertName(name) === expertKey)
		);
		const reviewedSources = relatedPosts.flatMap((post) =>
			(post.lineageSources ?? []).filter((source) =>
				getSkillExpertLineageRelationship(expert, source)
			)
		);

		return {
			expert,
			skillCount: relatedPosts.length,
			sourceCount: reviewedSources.length
		};
	});

	return {
		experts,
		totalSkills: new Set(
			posts
				.filter((post) =>
					experts.some(({ expert }) =>
						post.lineagePeople?.some(
							(name) =>
								normalizeSkillExpertName(name) ===
								normalizeSkillExpertName(expert.name)
						)
					)
				)
				.map((post) => post.slug)
		).size
	};
};
