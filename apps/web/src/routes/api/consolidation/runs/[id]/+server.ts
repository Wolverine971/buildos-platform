// apps/web/src/routes/api/consolidation/runs/[id]/+server.ts
// GET — the run, its plan and its question cards (the run page polls this while it works).
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { loadConsolidationView } from '$lib/server/consolidation/consolidation.service';
import { consolidationFailure } from '$lib/server/consolidation/consolidation-http';

export const GET: RequestHandler = async ({ locals, params }) => {
	const { user } = await locals.safeGetSession();
	if (!user?.id) return ApiResponse.unauthorized();
	if (!isValidUUID(params.id)) return ApiResponse.badRequest('Invalid run ID');
	try {
		return ApiResponse.success(
			await loadConsolidationView(
				createAdminSupabaseClient(),
				locals.supabase,
				user.id,
				params.id
			)
		);
	} catch (error) {
		return consolidationFailure(error, 'Could not load this consolidation.');
	}
};
