// apps/web/src/routes/ontology/+page.server.ts
/**
 * Ontology Dashboard - Server Load
 * Fetches all projects for the dashboard view
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Authentication required');
	}

	try {
		const actorId = await ensureActorId(locals.supabase, user.id);
		const projects = await fetchProjectSummaries(locals.supabase, actorId);
		return {
			projects
		};
	} catch (err) {
		console.error('[Ontology Dashboard] Failed to load project summaries', err);
		return {
			projects: [],
			error: 'Failed to load projects'
		};
	}
};
