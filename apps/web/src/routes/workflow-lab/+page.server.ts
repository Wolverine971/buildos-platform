// apps/web/src/routes/workflow-lab/+page.server.ts
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { parseChatWorkflowPrototypeUsers } from '@buildos/shared-types';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Sign in to use the workflow lab');
	if (
		!parseChatWorkflowPrototypeUsers(env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS).includes(
			user.id
		)
	) {
		error(404, 'Not found');
	}
	const actorId = await ensureActorId(locals.supabase, user.id);
	const projects = await fetchProjectSummaries(locals.supabase, actorId);
	return { projects: projects.map(({ id, name }) => ({ id, name })) };
};
