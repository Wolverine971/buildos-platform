// apps/web/src/routes/api/admin/feedback/overview/+server.ts
import { ApiResponse } from '$lib/utils/api-response';
import type { RequestHandler } from './$types';
import { getFeedbackOverview } from '$lib/services/admin/dashboard-analytics.service';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const data = await getFeedbackOverview(supabase);
		return ApiResponse.success(data);
	} catch (error) {
		console.error('Error fetching feedback overview:', error);
		return ApiResponse.internalError(error, 'Failed to fetch feedback overview');
	}
};
