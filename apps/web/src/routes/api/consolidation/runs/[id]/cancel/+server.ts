// apps/web/src/routes/api/consolidation/runs/[id]/cancel/+server.ts
// POST — stop a run before anything is applied; open cards are withdrawn.
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { cancelConsolidationRun } from '$lib/server/consolidation/consolidation.service';
import { consolidationFailure } from '$lib/server/consolidation/consolidation-http';

export const POST: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isValidUUID(params.id)) return ApiResponse.badRequest('Invalid run ID');
	try {
		await cancelConsolidationRun({
			admin: createAdminSupabaseClient(),
			userId: user.id,
			runId: params.id
		});
		return ApiResponse.success({ cancelled: true });
	} catch (error) {
		return consolidationFailure(error, 'Could not cancel this consolidation.');
	}
};
