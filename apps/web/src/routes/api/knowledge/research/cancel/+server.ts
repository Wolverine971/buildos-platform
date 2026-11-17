// apps/web/src/routes/api/knowledge/research/cancel/+server.ts
/**
 * POST /api/knowledge/research/cancel  { target_id } | { run_id }
 * Stop one entry's research, or a whole run (tasker 164). Run rows are server-written, so this
 * uses the admin client after checking the session; cancelKnowledgeResearch only touches the
 * caller's own rows.
 */
import type { RequestHandler } from './$types';
import { cancelKnowledgeResearch } from '@buildos/shared-agent-ops/knowledge';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { knowledgeErrorResponse, UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let body: { run_id?: unknown; target_id?: unknown };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	const targetId =
		typeof body.target_id === 'string' && UUID_PATTERN.test(body.target_id)
			? body.target_id
			: undefined;
	const runId =
		typeof body.run_id === 'string' && UUID_PATTERN.test(body.run_id) ? body.run_id : undefined;
	if (!targetId && !runId) return ApiResponse.badRequest('Say which research to stop');

	try {
		const result = await cancelKnowledgeResearch(
			createAdminSupabaseClient(),
			user.id,
			targetId ? { targetId } : { runId }
		);
		return ApiResponse.success(result);
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not stop the research');
	}
};
