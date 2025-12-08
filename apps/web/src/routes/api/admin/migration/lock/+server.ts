// apps/web/src/routes/api/admin/migration/lock/+server.ts
// GET /api/admin/migration/lock - Check platform lock status
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { MigrationStatsService } from '$lib/services/ontology/migration-stats.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async ({ locals: { safeGetSession } }) => {
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
		const lockStatus = await statsService.getLockStatus();

		return ApiResponse.success(lockStatus);
	} catch (error) {
		console.error('[Migration] Lock status fetch failed', error);
		return ApiResponse.internalError(error, 'Failed to fetch lock status');
	}
};
