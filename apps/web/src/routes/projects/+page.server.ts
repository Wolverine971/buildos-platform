// apps/web/src/routes/projects/+page.server.ts
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

export const load: PageServerLoad = async ({ locals, depends }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Authentication required');
	}

	depends('ontology:projects');

	const actorId = await ensureActorId(locals.supabase, user.id);

	const projects = fetchProjectSummaries(locals.supabase, actorId).catch((err) => {
		console.error('[Ontology Dashboard] Failed to load project summaries', err);
		throw err;
	});

	return {
		actorId,
		projects
	};
};
