// apps/web/src/routes/api/onto/organize/history/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { organizeHistory } from '$lib/server/organize/organize-service';
import { organizeFailure } from '$lib/server/organize/organize-http';
export const GET: RequestHandler = async ({ locals, url }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');
	const projectId = url.searchParams.get('project_id');
	if (!projectId || !isValidUUID(projectId)) return ApiResponse.badRequest('Invalid project ID');
	try {
		return ApiResponse.success({
			batches: await organizeHistory(
				locals.supabase,
				createAdminSupabaseClient(),
				user.id,
				projectId
			)
		});
	} catch (error) {
		return organizeFailure(error);
	}
};
