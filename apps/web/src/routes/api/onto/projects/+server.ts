// apps/web/src/routes/api/onto/projects/+server.ts
/**
 * GET /api/onto/projects
 * Returns lightweight project summaries for selection and browsing surfaces
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	ensureActorId,
	fetchProjectSelectorSummaries
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
	return value?.trim() ?? '';
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

		const search = normalizeProjectSearch(url.searchParams.get('search'));
		const limit =
			normalizeProjectListLimit(url.searchParams.get('limit')) ?? DEFAULT_PROJECT_LIST_LIMIT;

		let projects;
		try {
			projects = await fetchProjectSelectorSummaries(
				supabase,
				actorId,
				{ search, limit },
				locals.serverTiming
			);
		} catch (summaryError) {
			console.error('[Ontology API] Failed to fetch projects:', summaryError);
			return ApiResponse.error('Failed to fetch ontology projects', 500);
		}

		return ApiResponse.success({
			projects
		});
	} catch (err) {
		console.error('[Ontology API] Unexpected error:', err);
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
