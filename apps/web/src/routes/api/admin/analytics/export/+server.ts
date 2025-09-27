// src/routes/api/admin/analytics/export/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
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

		// Get comprehensive analytics data
		const [dailyUsers, briefStats, systemMetrics] = await Promise.all([
			supabase.rpc('get_daily_active_users', {
				start_date: startDate.toISOString().split('T')[0],
				end_date: endDate.toISOString().split('T')[0]
			}),
			supabase.rpc('get_brief_generation_stats', {
				start_date: startDate.toISOString().split('T')[0],
				end_date: endDate.toISOString().split('T')[0]
			}),
			supabase.from('system_metrics').select('*').order('recorded_at', { ascending: false })
		]);

		// Generate CSV content
		let csvContent = 'Date,Active Users,Total Briefs,Unique Brief Users,Avg Briefs Per User\n';

		// Merge daily users and brief stats by date
		const dataByDate = new Map();

		dailyUsers.data?.forEach((day) => {
			dataByDate.set(day.date, {
				...day,
				total_briefs: 0,
				unique_users: 0,
				avg_briefs_per_user: 0
			});
		});

		briefStats.data?.forEach((stat) => {
			const existing = dataByDate.get(stat.date) || { date: stat.date, active_users: 0 };
			dataByDate.set(stat.date, { ...existing, ...stat });
		});

		// Convert to CSV rows
		Array.from(dataByDate.values())
			.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
			.forEach((row) => {
				csvContent += `${row.date},${row.active_users || 0},${row.total_briefs || 0},${row.unique_users || 0},${row.avg_briefs_per_user || 0}\n`;
			});

		// Add system metrics section
		csvContent += '\n\nSystem Metrics\n';
		csvContent += 'Metric Name,Value,Unit,Recorded At\n';
		systemMetrics.data?.forEach((metric) => {
			csvContent += `${metric.metric_name},${metric.metric_value},${metric.metric_unit || ''},${metric.recorded_at}\n`;
		});

		return new Response(csvContent, {
			headers: {
				'Content-Type': 'text/csv',
				'Content-Disposition': `attachment; filename="life-os-analytics-${timeframe}-${new Date().toISOString().split('T')[0]}.csv"`
			}
		});
	} catch (error) {
		console.error('Error exporting analytics:', error);
		return ApiResponse.internalError(error, 'Failed to export analytics');
	}
};
