// apps/web/src/routes/api/admin/llm-usage/stats/+server.ts

import type { RequestHandler } from '@sveltejs/kit';
import { ApiResponse } from '$lib/utils/api-response';

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
		// Double-check admin membership to enforce strict access
		const {
			data: { user: authUser },
			error: authError
		} = await supabase.auth.getUser();

		if (authError || !authUser) {
			return ApiResponse.unauthorized();
		}

		const { data: adminCheck, error: adminError } = await supabase
			.from('admin_users')
			.select('user_id')
			.eq('user_id', authUser.id)
			.single();

		if (adminError) {
			return ApiResponse.databaseError(adminError);
		}
		if (!adminCheck) {
			return ApiResponse.forbidden('Admin access required');
		}

		const daysParam = parseInt(url.searchParams.get('days') || '30', 10);
		const lookbackDays =
			Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 30;

		const endDate = new Date();
		const startDate = new Date(endDate);
		startDate.setDate(startDate.getDate() - lookbackDays);

		const startIso = startDate.toISOString();
		const endIso = endDate.toISOString();
		const startDateOnly = startIso.split('T')[0];
		const endDateOnly = endIso.split('T')[0];

		// Get overview stats
		const { data: overviewData, error: overviewError } = await supabase
			.from('llm_usage_logs')
			.select('total_cost_usd, total_tokens, status, response_time_ms')
			.gte('created_at', startIso)
			.lte('created_at', endIso);

		if (overviewError) {
			return ApiResponse.databaseError(overviewError);
		}

		const overviewRows = overviewData ?? [];
		const totalCost = overviewRows.reduce(
			(sum, row) => sum + Number(row.total_cost_usd) || 0,
			0
		);
		const totalRequests = overviewRows.length;
		const totalTokens = overviewRows.reduce((sum, row) => sum + (row.total_tokens || 0), 0);
		const successCount = overviewRows.filter((row) => row.status === 'success').length;
		const totalResponseTime = overviewRows.reduce(
			(sum, row) => sum + (row.response_time_ms || 0),
			0
		);

		const overview = {
			totalCost,
			totalRequests,
			totalTokens,
			avgCostPerRequest: totalRequests > 0 ? totalCost / totalRequests : 0,
			successRate: totalRequests > 0 ? (successCount / totalRequests) * 100 : 0,
			avgResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0
		};

		// Get daily aggregated data for charts (last N days)
		const { data: dailyData, error: dailyError } = await supabase
			.from('llm_usage_summary')
			.select('*')
			.eq('summary_type', 'daily')
			.gte('summary_date', startDateOnly)
			.lte('summary_date', endDateOnly)
			.order('summary_date', { ascending: true });

		if (dailyError) {
			return ApiResponse.databaseError(dailyError);
		}

		let normalizedDaily = (dailyData ?? []).map((row) => ({
			summary_date: row.summary_date,
			total_requests: row.total_requests ?? 0,
			total_cost_usd: row.total_cost_usd ?? '0',
			total_tokens: row.total_tokens ?? 0,
			successful_requests: row.successful_requests ?? 0
		}));

		if (normalizedDaily.length === 0) {
			const { data: fallbackLogs, error: fallbackError } = await supabase
				.from('llm_usage_logs')
				.select('created_at, total_cost_usd, total_tokens, status')
				.gte('created_at', startIso)
				.lte('created_at', endIso);

			if (fallbackError) {
				return ApiResponse.databaseError(fallbackError);
			}

			const fallbackByDate = (fallbackLogs ?? []).reduce(
				(acc, row) => {
					const date = row.created_at.split('T')[0]!;
					if (!acc[date]) {
						acc[date] = {
							summary_date: date,
							total_requests: 0,
							total_cost_usd: 0,
							total_tokens: 0,
							successful_requests: 0
						};
					}

					acc[date].total_requests += 1;
					acc[date].total_tokens += row.total_tokens || 0;
					acc[date].total_cost_usd =
						acc[date].total_cost_usd + Number(row.total_cost_usd || 0);
					if (row.status === 'success') {
						acc[date].successful_requests += 1;
					}

					return acc;
				},
				{} as Record<
					string,
					{
						summary_date: string;
						total_requests: number;
						total_cost_usd: number;
						total_tokens: number;
						successful_requests: number;
					}
				>
			);

			normalizedDaily = Object.values(fallbackByDate).sort((a, b) =>
				a.summary_date.localeCompare(b.summary_date)
			);
		}

		// Get model breakdown
		const { data: modelData, error: modelError } = await supabase.rpc(
			'get_admin_model_breakdown',
			{
				p_start_date: startIso,
				p_end_date: endIso
			}
		);

		if (modelError) {
			return ApiResponse.databaseError(modelError);
		}

		// Get operation breakdown
		const { data: operationData, error: operationError } = await supabase.rpc(
			'get_admin_operation_breakdown',
			{
				p_start_date: startIso,
				p_end_date: endIso
			}
		);

		if (operationError) {
			return ApiResponse.databaseError(operationError);
		}

		// Get top users
		const { data: topUsers, error: topUsersError } = await supabase.rpc('get_admin_top_users', {
			p_start_date: startIso,
			p_end_date: endIso,
			p_limit: 20
		});

		if (topUsersError) {
			return ApiResponse.databaseError(topUsersError);
		}

		// Get recent activity
		const { data: recentLogs, error: recentLogsError } = await supabase
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
				created_at
			`
			)
			.gte('created_at', startIso)
			.lte('created_at', endIso)
			.order('created_at', { ascending: false })
			.limit(50);

		if (recentLogsError) {
			return ApiResponse.databaseError(recentLogsError);
		}

		// Enrich recent logs with user information
		const enrichedLogs = [];
		if (recentLogs && recentLogs.length > 0) {
			// Get unique user IDs
			const userIds = [...new Set(recentLogs.map((log) => log.user_id))];

			// Fetch user information
			const { data: users, error: usersError } = await supabase
				.from('users')
				.select('id, email, name')
				.in('id', userIds);

			if (usersError) {
				console.error('Error fetching users for logs:', usersError);
			}

			// Create a map for quick lookup
			const userMap = new Map(users?.map((u) => [u.id, u]) || []);

			// Combine logs with user info
			for (const log of recentLogs) {
				const user = userMap.get(log.user_id);
				enrichedLogs.push({
					...log,
					users: user ? { email: user.email, name: user.name } : null
				});
			}
		}

		return ApiResponse.success({
			overview,
			dailyData: normalizedDaily,
			modelBreakdown: modelData || [],
			operationBreakdown: operationData || [],
			topUsers: topUsers || [],
			recentLogs: enrichedLogs,
			dateRange: {
				start: startIso,
				end: endIso,
				days: lookbackDays
			}
		});
	} catch (error) {
		console.error('Error fetching admin LLM stats:', error);
		return ApiResponse.internalError(error, 'Failed to fetch stats');
	}
};
