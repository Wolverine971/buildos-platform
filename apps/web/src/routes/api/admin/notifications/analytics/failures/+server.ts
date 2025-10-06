// apps/web/src/routes/api/admin/notifications/analytics/failures/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

type Timeframe = '24h' | '7d' | '30d';

function getTimeframeInterval(timeframe: Timeframe): string {
	const intervals = {
		'24h': '24 hours',
		'7d': '7 days',
		'30d': '30 days'
	};
	return intervals[timeframe] || '24 hours';
}

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const timeframe = (url.searchParams.get('timeframe') || '24h') as Timeframe;
		const limit = parseInt(url.searchParams.get('limit') || '50', 10);
		const interval = getTimeframeInterval(timeframe);

		const { data, error } = await supabase.rpc('get_notification_failed_deliveries', {
			p_interval: interval,
			p_limit: Math.min(limit, 200) // Cap at 200
		});

		if (error) {
			console.error('Error fetching failed deliveries:', error);
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ failures: data || [] });
	} catch (error) {
		console.error('Error fetching failed delivery analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch failed delivery analytics');
	}
};
