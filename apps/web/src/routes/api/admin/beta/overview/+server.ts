// apps/web/src/routes/api/admin/beta/overview/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getBetaOverview } from '$lib/services/admin/dashboard-analytics.service';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const data = await getBetaOverview(supabase);
		return ApiResponse.success(data);
	} catch (error) {
		console.error('Error fetching beta overview:', error);
		return ApiResponse.internalError(error, 'Failed to fetch beta overview');
	}
};
