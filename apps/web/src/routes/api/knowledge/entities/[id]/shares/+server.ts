// apps/web/src/routes/api/knowledge/entities/[id]/shares/+server.ts
/**
 * GET /api/knowledge/entities/:id/shares → "Who can see Kyle" (tasker 168), owner only:
 * { projects: shared projects where the public facts show by default, with their members,
 *   shares: asks and grants on this entry (live or recent) }
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { UUID_PATTERN } from '$lib/server/knowledge/knowledge.server';
import { loadEntityShares, sharingErrorResponse } from '$lib/server/knowledge/sharing.server';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	if (!UUID_PATTERN.test(params.id)) return ApiResponse.badRequest('Invalid entry');
	try {
		return ApiResponse.success(await loadEntityShares(locals.supabase, params.id));
	} catch (error) {
		return sharingErrorResponse(error, ApiResponse, 'Could not load who can see this');
	}
};
