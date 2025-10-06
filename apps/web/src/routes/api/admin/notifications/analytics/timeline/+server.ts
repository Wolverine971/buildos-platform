// apps/web/src/routes/api/admin/notifications/analytics/timeline/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

type Timeframe = '24h' | '7d' | '30d' | '90d';
type Granularity = 'hour' | 'day';

function getTimeframeInterval(timeframe: Timeframe): string {
	const intervals = {
		'24h': '24 hours',
		'7d': '7 days',
		'30d': '30 days',
		'90d': '90 days'
	};
	return intervals[timeframe] || '7 days';
}

function getGranularity(timeframe: Timeframe, requested?: string): Granularity {
	if (requested && (requested === 'hour' || requested === 'day')) {
		return requested;
	}
	// Auto-select based on timeframe
	return timeframe === '24h' ? 'hour' : 'day';
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
		const timeframe = (url.searchParams.get('timeframe') || '7d') as Timeframe;
		const granularity = getGranularity(
			timeframe,
			url.searchParams.get('granularity') || undefined
		);
		const interval = getTimeframeInterval(timeframe);

		const { data, error } = await supabase.rpc('get_notification_delivery_timeline', {
			p_interval: interval,
			p_granularity: granularity
		});

		if (error) {
			console.error('Error fetching delivery timeline:', error);
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ timeline: data || [] });
	} catch (error) {
		console.error('Error fetching notification timeline analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch notification timeline analytics');
	}
};
