// apps/web/src/routes/api/knowledge/entities/[id]/not-this-one/+server.ts
/**
 * POST /api/knowledge/entities/:id/not-this-one { run_id }
 *   "Not this one" (tasker 164): retracts every detail that research run added to the entry,
 *   hides entries only that run created, and saves a private hint ("not the Cody Shooting
 *   Complex in Long Grove, IA") that the next research uses to skip the wrong one.
 *   Runs with the signed-in user's client: RLS limits it to their own facts and hints.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	knowledgeErrorResponse,
	knowledgeStoreFor,
	UUID_PATTERN
} from '$lib/server/knowledge/knowledge.server';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid id');
	let body: { run_id?: string };
	try {
		body = await request.json();
	} catch {
		return ApiResponse.badRequest('Invalid JSON');
	}
	if (!UUID_PATTERN.test(body.run_id ?? '')) return ApiResponse.badRequest('Invalid run');
	try {
		const result = await knowledgeStoreFor(locals.supabase, user.id).rejectResearchRun(
			params.id,
			body.run_id!
		);
		return ApiResponse.success(result);
	} catch (error) {
		return knowledgeErrorResponse(error, 'Could not undo that research');
	}
};
