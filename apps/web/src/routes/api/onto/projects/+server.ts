// apps/web/src/routes/api/onto/projects/+server.ts
/**
 * GET /api/onto/projects
 * Returns project summaries with basic counts for dashboard views
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const supabase = locals.supabase;
		const measure = <T>(name: string, fn: () => Promise<T> | T) =>
			locals.serverTiming ? locals.serverTiming.measure(name, fn) : fn();

		let actorId: string;
		try {
			actorId = await measure('db.ensure_actor', () => ensureActorId(supabase, user.id));
		} catch (actorError) {
			console.error('[Ontology API] Failed to get actor:', actorError);
			return ApiResponse.error('Failed to resolve user actor', 500);
		}

		let summaries;
		try {
			summaries = await fetchProjectSummaries(supabase, actorId, locals.serverTiming);
		} catch (summaryError) {
			console.error('[Ontology API] Failed to fetch projects:', summaryError);
			return ApiResponse.error('Failed to fetch ontology projects', 500);
		}

		return ApiResponse.success({
			projects: summaries
		});
	} catch (err) {
		console.error('[Ontology API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
