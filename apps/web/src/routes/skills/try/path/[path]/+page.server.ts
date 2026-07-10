// apps/web/src/routes/skills/try/path/[path]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { loadAgentSkillIndex } from '$lib/server/agent-skills';
import { loadAgentSkillPosts } from '$lib/utils/blog';
import { buildPackCards, buildPackLaunchPrompt } from '$lib/skills/skill-gallery';

export const load: PageServerLoad = async ({ params, locals: { safeGetSession } }) => {
	const [posts, catalog, session] = await Promise.all([
		loadAgentSkillPosts(),
		loadAgentSkillIndex(),
		safeGetSession()
	]);
	const pack = buildPackCards(catalog.skills).find((item) => item.id === params.path);

	if (!pack) {
		throw error(404, 'Skill path not found');
	}

	const prompt = buildPackLaunchPrompt(pack, posts);
	const appParams = new URLSearchParams({
		open: 'agent-chat',
		prompt
	});
	const appPath = `/?${appParams.toString()}`;

	if (session.user) {
		throw redirect(303, appPath);
	}

	throw redirect(303, `/auth/register?redirect=${encodeURIComponent(appPath)}`);
};
