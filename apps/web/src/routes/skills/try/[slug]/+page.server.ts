// apps/web/src/routes/skills/try/[slug]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { loadAgentSkillPosts } from '$lib/utils/blog';
import {
	buildPostBySlug,
	buildPreviewSkillLaunchPrompt,
	buildSkillLaunchPrompt,
	getFallbackTryPrompts
} from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params, url, locals: { safeGetSession } }) => {
	const [posts, catalog, session] = await Promise.all([
		loadAgentSkillPosts(),
		loadAgentSkillIndex(),
		safeGetSession()
	]);
	const skill = catalog.skills.find((item) => item.slug === params.slug);
	const preview = catalog.previews.find((item) => item.slug === params.slug);

	if (!skill && !preview) {
		throw error(404, 'Skill not found');
	}

	const requestedPrompt = url.searchParams.get('prompt')?.trim();
	const publicStarterPrompt = skill
		? getFallbackTryPrompts(skill).find((candidate) => candidate === requestedPrompt)
		: undefined;
	const previewStarterPrompt = preview?.starter_prompts.find(
		(candidate) => candidate === requestedPrompt
	);
	const prompt = skill
		? buildSkillLaunchPrompt(skill, buildPostBySlug(posts).get(skill.slug), publicStarterPrompt)
		: buildPreviewSkillLaunchPrompt(preview!, previewStarterPrompt);
	const appParams = new URLSearchParams({
		open: 'agent-chat',
		skill: skill?.runtime_skill_id ?? preview!.runtime_skill_id,
		prompt
	});
	const appPath = `/?${appParams.toString()}`;

	if (session.user) {
		throw redirect(303, appPath);
	}

	throw redirect(303, `/auth/register?redirect=${encodeURIComponent(appPath)}`);
};
