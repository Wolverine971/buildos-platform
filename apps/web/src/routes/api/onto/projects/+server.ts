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

const DEFAULT_PROJECT_LIST_LIMIT = 24;
const MAX_PROJECT_LIST_LIMIT = 100;

function normalizeProjectListLimit(value: string | null): number | null {
	if (!value) return null;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return null;
	return Math.min(MAX_PROJECT_LIST_LIMIT, Math.max(1, parsed));
}

function normalizeProjectSearch(value: string | null): string {
	return value?.trim().toLowerCase() ?? '';
}

export const GET: RequestHandler = async ({ locals, url }) => {
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

		const search = normalizeProjectSearch(url.searchParams.get('search'));
		const limit =
			normalizeProjectListLimit(url.searchParams.get('limit')) ?? DEFAULT_PROJECT_LIST_LIMIT;

		let filteredSummaries = summaries;
		if (search) {
			filteredSummaries = summaries.filter((project) => {
				const haystack = [
					project.name,
					project.description,
					project.facet_context,
					project.facet_scale,
					project.facet_stage
				]
					.filter(
						(value): value is string => typeof value === 'string' && value.length > 0
					)
					.join(' ')
					.toLowerCase();
				return haystack.includes(search);
			});
		}

		return ApiResponse.success({
			projects: filteredSummaries.slice(0, limit)
		});
	} catch (err) {
		console.error('[Ontology API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
