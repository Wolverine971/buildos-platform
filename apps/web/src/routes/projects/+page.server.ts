// apps/web/src/routes/projects/+page.server.ts
/**
 * Ontology Dashboard - Server Load
 * Fetches all projects for the dashboard view
 *
 * PERFORMANCE OPTIMIZATIONS (Dec 2024 - Skeleton Loading):
 * - projectCount returned IMMEDIATELY for instant skeleton rendering
 * - Full project data streamed in background
 * - Zero layout shift - exact number of skeleton cards rendered from start
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

	// FAST: Get project count immediately (~20-50ms)
	// This enables instant skeleton card rendering
	// Filter out soft-deleted projects (deleted_at IS NULL)
	const { count: projectCount, error: countError } = await locals.supabase
		.from('onto_projects')
		.select('*', { count: 'exact', head: true })
		.eq('created_by', actorId)
		.is('deleted_at', null);

	if (countError) {
		console.error('[Projects] Failed to get project count:', countError);
	}

	// STREAMED: Full project data loaded in background
	// Skeletons will be hydrated when this resolves
	const projects = fetchProjectSummaries(locals.supabase, actorId).catch((err) => {
		console.error('[Ontology Dashboard] Failed to load project summaries', err);
		throw err;
	});

	return {
		actorId,
		projects,
		projectCount: projectCount ?? 0
	};
};
