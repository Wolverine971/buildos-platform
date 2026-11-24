// apps/web/src/routes/api/knowledge/locate/+server.ts
/**
 * "Find where my companies are" (tasker 170). Free: the worker looks each organization up in
 * the company directory and free public sources; nothing here spends money.
 *
 * GET    /api/knowledge/locate
 *        The banner's state: the latest lookup run, open "Which one?" questions, and how many
 *        companies are left for a web search. Null when there is nothing to show.
 * POST   /api/knowledge/locate  { entity_ids?: string[], origin?: 'import' | 'manual' }
 *        Queue a lookup of the caller's organizations that have no place yet: the ones listed
 *        (what an import touched), or all of them. One run at a time; a second request reports
 *        the run already going.
 * DELETE /api/knowledge/locate?run_id=
 *        Stop a run. What was already found stays.
 *
 * Runs and queue jobs are server-only, so starting and stopping use the admin client after
 * checking the session; only the caller's own organizations are read.
 */
import type { RequestHandler } from './$types';
import {
	MAX_LOCATE_TARGETS,
	cancelCompanyLocate,
	startCompanyLocate
} from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	knowledgeDb,
	knowledgeErrorResponse,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';
import { loadLocateTray } from '$lib/server/knowledge/company-locate.server';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	try {
		return ApiResponse.success({
			locate: await loadLocateTray(knowledgeDb(locals.supabase), user.id)
		});
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not load the company lookup');
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let body: { entity_ids?: unknown; origin?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	let entityIds: string[] | undefined;
	if (body.entity_ids !== undefined) {
		if (!Array.isArray(body.entity_ids))
			return ApiResponse.badRequest('entity_ids must be a list');
		if (body.entity_ids.length > MAX_LOCATE_TARGETS)
			return ApiResponse.badRequest(
				`Look up at most ${MAX_LOCATE_TARGETS} companies at a time`
			);
		entityIds = [
			...new Set(
				body.entity_ids.filter(
					(id): id is string => typeof id === 'string' && UUID_PATTERN.test(id)
				)
			)
		];
	}

	try {
		const result = await startCompanyLocate(createAdminSupabaseClient(), user.id, {
			...(entityIds ? { entityIds } : {}),
			origin: body.origin === 'import' ? 'import' : 'manual'
		});
		return ApiResponse.success({
			run_id: result.runId,
			queued: result.queued,
			reason: result.reason ?? null
		});
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not start the company lookup');
	}
};

export const DELETE: RequestHandler = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const runId = url.searchParams.get('run_id') ?? '';
	if (!UUID_PATTERN.test(runId)) return ApiResponse.badRequest('Invalid run');
	try {
		const stopped = await cancelCompanyLocate(createAdminSupabaseClient(), user.id, runId);
		return ApiResponse.success({ stopped });
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not stop the company lookup');
	}
};
