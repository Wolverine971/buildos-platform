// apps/web/src/routes/api/onto/projects/trash/+server.ts
/**
 * Projects the signed-in user deleted and can still restore.
 */
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) return ApiResponse.unauthorized('Authentication required');

		const { data, error } = await locals.supabase.rpc('list_my_deleted_onto_projects');
		if (error) {
			console.error('[Project Trash API] Failed to list trash:', error);
			return ApiResponse.error('Failed to load deleted projects', 500);
		}

		return ApiResponse.success({ projects: data ?? [] });
	} catch (error) {
		console.error('[Project Trash API] Unexpected error:', error);
		return ApiResponse.internalError(error, 'Failed to load deleted projects');
	}
};
