// apps/web/src/routes/api/consolidation/runs/[id]/merge/+server.ts
// POST { cluster_key } — start a failed merge over from reading its sources.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { retryMerge } from '$lib/server/consolidation/consolidation.service';
import { consolidationFailure, readJsonBody } from '$lib/server/consolidation/consolidation-http';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isValidUUID(params.id)) return ApiResponse.badRequest('Invalid run ID');
	const body = await readJsonBody(request);
	if (typeof body.cluster_key !== 'string')
		return ApiResponse.badRequest('cluster_key is required');
	try {
		await retryMerge({
			admin: createAdminSupabaseClient(),
			session: locals.supabase,
			userId: user.id,
			runId: params.id,
			clusterKey: body.cluster_key
		});
		return ApiResponse.success({ retried: true });
	} catch (error) {
		return consolidationFailure(error, 'Could not retry this merge.');
	}
};
