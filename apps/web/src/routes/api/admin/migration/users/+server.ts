// apps/web/src/routes/api/admin/migration/users/+server.ts
// GET /api/admin/migration/users - Paginated list of users with migration statistics
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	MigrationStatsService,
	type MigrationUserStatus
} from '$lib/services/ontology/migration-stats.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	// Parse query parameters
	const limitParam = url.searchParams.get('limit');
	const offsetParam = url.searchParams.get('offset');
	const sortBy = url.searchParams.get('sortBy') as
		| 'email'
		| 'totalProjects'
		| 'percentComplete'
		| 'lastMigrationAt'
		| null;
	const sortOrder = url.searchParams.get('sortOrder') as 'asc' | 'desc' | null;
	const status = url.searchParams.get('status') as MigrationUserStatus | null;
	const search = url.searchParams.get('search');

	const limit = limitParam ? parseInt(limitParam, 10) : 50;
	const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

	const supabase = createAdminSupabaseClient();

	try {
		const statsService = new MigrationStatsService(supabase);
		const result = await statsService.getUsers({
			limit,
			offset,
			sortBy: sortBy ?? undefined,
			sortOrder: sortOrder ?? undefined,
			status: status ?? undefined,
			search: search ?? undefined
		});

		return ApiResponse.success(result);
	} catch (error) {
		console.error('[Migration] Users fetch failed', error);
		return ApiResponse.internalError(error, 'Failed to fetch users');
	}
};
