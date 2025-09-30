// apps/web/src/routes/api/admin/analytics/daily-signups/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { safeGetSession, supabase } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	const timeframe = url.searchParams.get('timeframe') || '30d';
	const days = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;

	try {
		const endDate = new Date();
		const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

		// Get daily signup counts
		const { data, error } = await supabase
			.from('users')
			.select('created_at')
			.gte('created_at', startDate.toISOString())
			.lte('created_at', endDate.toISOString())
			.order('created_at', { ascending: true });

		if (error) {
			return ApiResponse.databaseError(error);
		}

		// Group signups by day
		const signupsByDay: { [key: string]: number } = {};

		// Initialize all days with 0
		for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
			const dateStr = d.toISOString().split('T')[0];
			signupsByDay[dateStr] = 0;
		}

		// Count signups per day
		(data || []).forEach((user) => {
			const date = new Date(user.created_at).toISOString().split('T')[0];
			if (signupsByDay[date] !== undefined) {
				signupsByDay[date]++;
			}
		});

		// Convert to array format
		const transformedData = Object.entries(signupsByDay)
			.map(([date, count]) => ({
				date,
				signup_count: count
			}))
			.sort((a, b) => a.date.localeCompare(b.date));

		return ApiResponse.success(transformedData);
	} catch (error) {
		console.error('Error fetching daily signups analytics:', error);
		return ApiResponse.internalError(error, 'Failed to fetch daily signups analytics');
	}
};
