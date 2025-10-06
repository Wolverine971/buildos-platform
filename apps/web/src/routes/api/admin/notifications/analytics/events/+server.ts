// apps/web/src/routes/api/admin/notifications/analytics/events/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

type Timeframe = '24h' | '7d' | '30d' | '90d';

function getTimeframeInterval(timeframe: Timeframe): string {
	const intervals = {
		'24h': '24 hours',
		'7d': '7 days',
		'30d': '30 days',
		'90d': '90 days'
	};
	return intervals[timeframe] || '30 days';
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
		const timeframe = (url.searchParams.get('timeframe') || '30d') as Timeframe;
		const interval = getTimeframeInterval(timeframe);

		const { data, error } = await supabase.rpc('get_notification_event_performance', {
			p_interval: interval
		});

		if (error) {
			console.error('Error fetching event performance:', error);
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ events: data || [] });
	} catch (error) {
		console.error('Error fetching notification event analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch notification event analytics');
	}
};
