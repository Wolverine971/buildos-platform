// apps/web/src/routes/api/account/shared-projects/+server.ts
/**
 * Shared projects the signed-in user owns, with who could take over each one.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) return ApiResponse.unauthorized('Authentication required');

		const { data, error } = await locals.supabase.rpc('list_my_shared_owned_onto_projects');
		if (error) {
			console.error('[Shared Projects API] Failed to list shared projects:', error);
			return ApiResponse.error('Failed to load shared projects', 500);
		}

		return ApiResponse.success({ projects: data ?? [] });
	} catch (error) {
		console.error('[Shared Projects API] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to load shared projects');
	}
};
