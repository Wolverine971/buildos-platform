// apps/web/src/routes/api/admin/subscriptions/overview/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getSubscriptionOverview } from '$lib/services/admin/dashboard-analytics.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	// Check admin status
	const { data: adminCheck } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (!adminCheck?.is_admin) {
		return ApiResponse.forbidden();
	}

	try {
		const adminSupabase = createAdminSupabaseClient();
		const data = await getSubscriptionOverview(adminSupabase);
		return ApiResponse.success(data);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to load subscription data');
	}
};
