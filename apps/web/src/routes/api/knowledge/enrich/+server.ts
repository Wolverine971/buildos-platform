// apps/web/src/routes/api/knowledge/enrich/+server.ts
/**
 * POST /api/knowledge/enrich  { entity_ids: string[], fields?: string[], instructions?: string }
 *
 * "Find more about this": queue background web research for up to 25 entries. Paid; capped
 * per run and per day in startKnowledgeEnrichment. Queue jobs are server-only, so this uses
 * the admin client after checking the session; the store still filters to what the caller
 * can see.
 */
import type { RequestHandler } from './$types';
import { startKnowledgeEnrichment } from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { knowledgeErrorResponse, UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let body: { entity_ids?: unknown; fields?: unknown; instructions?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const entityIds = Array.isArray(body.entity_ids)
		? body.entity_ids.filter(
				(id): id is string => typeof id === 'string' && UUID_PATTERN.test(id)
			)
		: [];
	if (!entityIds.length) return ApiResponse.badRequest('Pick at least one entry');
	const fields = Array.isArray(body.fields)
		? body.fields.filter((f): f is string => typeof f === 'string').slice(0, 20)
		: undefined;
	const instructions =
		typeof body.instructions === 'string' ? body.instructions.slice(0, 1000) : undefined;

	try {
		const result = await startKnowledgeEnrichment(createAdminSupabaseClient(), user.id, {
			entityIds,
			...(fields?.length ? { fields } : {}),
			...(instructions ? { instructions } : {}),
			trigger: 'ui'
		});
		return ApiResponse.success(result);
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not start the research');
	}
};
