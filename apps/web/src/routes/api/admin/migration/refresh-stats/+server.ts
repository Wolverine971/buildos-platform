// apps/web/src/routes/api/admin/migration/refresh-stats/+server.ts
// POST /api/admin/migration/refresh-stats - Refresh the materialized view
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { MigrationStatsService } from '$lib/services/ontology/migration-stats.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const POST: RequestHandler = async ({ locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const supabase = createAdminSupabaseClient();

	try {
		const statsService = new MigrationStatsService(supabase);
		const result = await statsService.refreshStats();

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[Migration] Stats refresh failed', error);
		return ApiResponse.internalError(error, 'Failed to refresh stats');
	}
};
