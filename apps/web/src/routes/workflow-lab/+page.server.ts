// apps/web/src/routes/workflow-lab/+page.server.ts
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';
import { parseChatWorkflowPrototypeUsers } from '@buildos/shared-types';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import type { PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	listPublishedSpecialistVersions,
	type SpecialistWorkbenchClient
} from '$lib/services/agentic-chat-v2/specialist-workbench.server';
import type { WorkbenchVersionSummary } from '$lib/types/specialist-workbench';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	const { user } = await locals.safeGetSession();
	if (!user) error(401, 'Sign in to use the workflow lab');
	// Local dev always opens the lab; starting a review still passes the admission gates.
	if (
		!dev &&
		!parseChatWorkflowPrototypeUsers(env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS).includes(
			user.id
		)
	) {
		error(404, 'Not found');
	}
	setHeaders({ 'Cache-Control': 'private, no-store' });
	const publishedSpecialistsEnabled = [
		env.AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED,
		env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED,
		env.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED,
		env.AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED
	].every((flag) => flag?.trim() === 'true');
	const catalogPromise = loadPublishedSpecialists(user.id, publishedSpecialistsEnabled);
	const actorId = await ensureActorId(locals.supabase, user.id);
	const [projects, catalog] = await Promise.all([
		fetchProjectSummaries(locals.supabase, actorId),
		catalogPromise
	]);
	return {
		projects: projects.map(({ id, name }) => ({ id, name })),
		...catalog,
		contextFinderEnabled:
			publishedSpecialistsEnabled &&
			env.AGENTIC_CHAT_CONTEXT_FINDER_ENABLED?.trim() === 'true' &&
			!!env.PRIVATE_OPENROUTER_API_KEY?.trim(),
		jevRecommendationsEnabled:
			publishedSpecialistsEnabled &&
			env.AGENTIC_CHAT_JEV_RECOMMENDATIONS_ENABLED?.trim() === 'true' &&
			!!env.PRIVATE_OPENROUTER_API_KEY?.trim(),
		publishedSpecialistsEnabled
	};
};

async function loadPublishedSpecialists(
	userId: string,
	enabled: boolean
): Promise<{
	publishedSpecialists: WorkbenchVersionSummary[];
	specialistLoadError: string | null;
}> {
	if (enabled) {
		try {
			const client = createAdminSupabaseClient() as unknown as SpecialistWorkbenchClient;
			return {
				publishedSpecialists: await listPublishedSpecialistVersions(client, userId),
				specialistLoadError: null
			};
		} catch {
			return {
				publishedSpecialists: [],
				specialistLoadError:
					'Published specialists could not be loaded. Reload to try again.'
			};
		}
	}
	return { publishedSpecialists: [], specialistLoadError: null };
}
