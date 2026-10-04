// apps/web/src/routes/api/consolidation/runs/[id]/veto/+server.ts
// POST { cluster_key, vetoed } — leave a decided-for-you group as it is, or undo that.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { setClusterVeto } from '$lib/server/consolidation/consolidation.service';
import { consolidationFailure, readJsonBody } from '$lib/server/consolidation/consolidation-http';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isValidUUID(params.id)) return ApiResponse.badRequest('Invalid run ID');
	const body = await readJsonBody(request);
	if (typeof body.cluster_key !== 'string' || typeof body.vetoed !== 'boolean')
		return ApiResponse.badRequest('cluster_key and vetoed are required');
	try {
		await setClusterVeto({
			admin: createAdminSupabaseClient(),
			userId: user.id,
			runId: params.id,
			clusterKey: body.cluster_key,
			vetoed: body.vetoed
		});
		return ApiResponse.success({ vetoed: body.vetoed });
	} catch (error) {
		return consolidationFailure(error, 'Could not change this group.');
	}
};
