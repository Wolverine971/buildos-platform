// apps/web/src/routes/api/admin/notifications/analytics/sms-stats/+server.ts
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
		const { data, error } = await supabase.rpc('get_sms_notification_stats');

		if (error) {
			console.error('Error fetching SMS notification stats:', error);
			return ApiResponse.databaseError(error);
		}

		// RPC returns single row, extract it
		const stats = data?.[0] || {
			total_users_with_phone: 0,
			users_phone_verified: 0,
			users_sms_enabled: 0,
			users_opted_out: 0,
			phone_verification_rate: 0,
			sms_adoption_rate: 0,
			opt_out_rate: 0,
			total_sms_sent_24h: 0,
			sms_delivery_rate_24h: 0,
			avg_sms_delivery_time_seconds: 0
		};

		return ApiResponse.success(stats);
	} catch (error) {
		console.error('Error fetching SMS notification analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch SMS notification analytics');
	}
};
