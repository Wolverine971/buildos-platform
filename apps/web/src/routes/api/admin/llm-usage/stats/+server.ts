// apps/web/src/routes/api/admin/llm-usage/stats/+server.ts

import { json, type RequestHandler } from '@sveltejs/kit';
import { ApiResponse } from '$utils/api-response';

/**
 * GET /api/admin/llm-usage/stats
 * Returns comprehensive LLM usage statistics for admin dashboard
 * Query params:
 *   - days: number of days to look back (default: 30)
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		// Check if user is admin
		const {
			data: { user },
			error: authError
		} = await supabase.auth.getUser();

		if (authError || !user) {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const { data: adminCheck } = await supabase
			.from('admin_users')
			.select('user_id')
			.eq('user_id', user.id)
			.single();

		if (!adminCheck) {
			return json(
				{ success: false, error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		const days = parseInt(url.searchParams.get('days') || '30');
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		// Get overview stats
		const { data: overviewData } = await supabase
			.from('llm_usage_logs')
			.select('total_cost_usd, total_tokens, status, response_time_ms')
			.gte('created_at', startDate.toISOString());

		const overview = {
			totalCost: overviewData?.reduce((sum, row) => sum + Number(row.total_cost_usd), 0) || 0,
			totalRequests: overviewData?.length || 0,
			totalTokens: overviewData?.reduce((sum, row) => sum + row.total_tokens, 0) || 0,
			avgCostPerRequest:
				overviewData && overviewData.length > 0
					? overviewData.reduce((sum, row) => sum + Number(row.total_cost_usd), 0) /
						overviewData.length
					: 0,
			successRate:
				overviewData && overviewData.length > 0
					? (overviewData.filter((row) => row.status === 'success').length /
							overviewData.length) *
						100
					: 0,
			avgResponseTime:
				overviewData && overviewData.length > 0
					? overviewData.reduce((sum, row) => sum + row.response_time_ms, 0) /
						overviewData.length
					: 0
		};

		// Get daily aggregated data for charts (last N days)
		const { data: dailyData } = await supabase
			.from('llm_usage_summary')
			.select('*')
			.eq('summary_type', 'daily')
			.gte('summary_date', startDate.toISOString().split('T')[0])
			.order('summary_date', { ascending: true });

		// Get model breakdown
		const { data: modelData } = await supabase.rpc('get_admin_model_breakdown', {
			p_start_date: startDate.toISOString(),
			p_end_date: new Date().toISOString()
		});

		// Get operation breakdown
		const { data: operationData } = await supabase.rpc('get_admin_operation_breakdown', {
			p_start_date: startDate.toISOString(),
			p_end_date: new Date().toISOString()
		});

		// Get top users
		const { data: topUsers } = await supabase.rpc('get_admin_top_users', {
			p_start_date: startDate.toISOString(),
			p_end_date: new Date().toISOString(),
			p_limit: 20
		});

		// Get recent activity
		const { data: recentLogs } = await supabase
			.from('llm_usage_logs')
			.select(
				`
				id,
				user_id,
				operation_type,
				model_used,
				total_cost_usd,
				total_tokens,
				response_time_ms,
				status,
				created_at,
				users!inner(email, name)
			`
			)
			.order('created_at', { ascending: false })
			.limit(50);

		return json({
			success: true,
			data: {
				overview,
				dailyData: dailyData || [],
				modelBreakdown: modelData || [],
				operationBreakdown: operationData || [],
				topUsers: topUsers || [],
				recentLogs: recentLogs || [],
				dateRange: {
					start: startDate.toISOString(),
					end: new Date().toISOString(),
					days
				}
			}
		});
	} catch (error) {
		console.error('Error fetching admin LLM stats:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to fetch stats'
			},
			{ status: 500 }
		);
	}
};
