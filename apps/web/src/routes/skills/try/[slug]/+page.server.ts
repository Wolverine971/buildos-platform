// apps/web/src/routes/skills/try/[slug]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { loadAgentSkillPosts } from '$lib/utils/blog';
import { buildPostBySlug, buildSkillLaunchPrompt } from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params, locals: { safeGetSession } }) => {
	const [posts, catalog, session] = await Promise.all([
		loadAgentSkillPosts(),
		loadAgentSkillIndex(),
		safeGetSession()
	]);
	const skill = catalog.skills.find((item) => item.slug === params.slug);

	if (!skill) {
		throw error(404, 'Skill not found');
	}

	const post = buildPostBySlug(posts).get(skill.slug);
	const prompt = buildSkillLaunchPrompt(skill, post);
	const appParams = new URLSearchParams({
		open: 'agent-chat',
		skill: skill.slug,
		prompt
	});
	const appPath = `/?${appParams.toString()}`;

	if (session.user) {
		throw redirect(303, appPath);
	}

	throw redirect(303, `/auth/register?redirect=${encodeURIComponent(appPath)}`);
};
