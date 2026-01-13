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

	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		locals.serverTiming ? locals.serverTiming.measure(name, fn) : fn();

	const actorId = await measure('db.ensure_actor', () => ensureActorId(locals.supabase, user.id));

	// FAST: Get project count immediately (~20-50ms)
	// Prefer membership count so shared projects are included.
	const { count: memberCount, error: memberCountError } = await measure(
		'db.project_members.count',
		() =>
			locals.supabase
				.from('onto_project_members')
				.select('id', { count: 'estimated', head: true })
				.eq('actor_id', actorId)
				.is('removed_at', null)
	);

	let projectCount = memberCount ?? 0;
	if (memberCountError) {
		console.error('[Projects] Failed to get membership count:', memberCountError);
		const { count: fallbackCount, error: countError } = await measure(
			'db.projects.count_fallback',
			() =>
				locals.supabase
					.from('onto_projects')
					.select('*', { count: 'estimated', head: true })
					.eq('created_by', actorId)
					.is('deleted_at', null)
		);
		if (countError) {
			console.error('[Projects] Failed to get project count:', countError);
		}
		projectCount = fallbackCount ?? 0;
	}

	// STREAMED: Full project data loaded in background
	// Skeletons will be hydrated when this resolves
	const projects = fetchProjectSummaries(locals.supabase, actorId, locals.serverTiming).catch(
		(err) => {
			console.error('[Ontology Dashboard] Failed to load project summaries', err);
			throw err;
		}
	);

	return {
		actorId,
		projects,
		projectCount
	};
};
