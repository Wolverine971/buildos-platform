// apps/web/src/routes/api/admin/notifications/analytics/subscriptions/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const { data, error } = await supabase.rpc('get_notification_active_subscriptions');

		if (error) {
			console.error('Error fetching active subscriptions:', error);
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ subscriptions: data || [] });
	} catch (error) {
		console.error('Error fetching notification subscription analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch notification subscription analytics');
	}
};
