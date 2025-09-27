// src/routes/api/admin/analytics/recent-activity/+server.ts
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
		const { data, error } = await supabase
			.from('user_activity_logs')
			.select(
				`
                activity_type,
                activity_data,
                created_at,
                users (
                    email
                )
            `
			)
			.order('created_at', { ascending: false })
			.limit(50);

		if (error) {
			return ApiResponse.databaseError(error);
		}

		const formattedData = (data || []).map((activity) => ({
			activity_type: activity.activity_type,
			user_email: activity.users?.email || 'Unknown',
			created_at: activity.created_at,
			activity_data: activity.activity_data
		}));

		return ApiResponse.success(formattedData);
	} catch (error) {
		console.error('Error fetching recent activity:', error);
		return ApiResponse.internalError(error, 'Failed to fetch recent activity');
	}
};
