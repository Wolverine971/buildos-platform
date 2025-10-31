// apps/web/src/routes/api/admin/chat/tools/+server.ts
/**
 * Tool Analytics API
 *
 * Returns comprehensive tool usage and performance metrics including:
 * - Tool usage breakdown by category and individual tool
 * - Success rates and error analysis
 * - Execution time statistics
 * - Token consumption by tool
 * - Most/least used tools
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	// Check authentication
	const { user } = await safeGetSession();
	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	// Check admin permission
	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	const timeframe = url.searchParams.get('timeframe') || '7d';

	// Calculate time range
	const now = new Date();
	let startDate: Date;

	switch (timeframe) {
		case '24h':
			startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			break;
		case '30d':
			startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			break;
		case '7d':
		default:
			startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
	}

	try {
		// ===================================================
		// 1. TOOL EXECUTIONS DATA
		// ===================================================
		const { data: toolExecutionsData, error: toolExecutionsError } = await supabase
			.from('chat_tool_executions')
			.select(
				'tool_name, tool_category, success, execution_time_ms, error_message, tokens_consumed, created_at, session_id'
			)
			.gte('created_at', startDate.toISOString());

		if (toolExecutionsError) throw toolExecutionsError;

		const totalExecutions = toolExecutionsData?.length || 0;
		const successfulExecutions =
			toolExecutionsData?.filter((e) => e.success === true).length || 0;
		const failedExecutions = toolExecutionsData?.filter((e) => e.success === false).length || 0;
		const successRate =
			totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

		// ===================================================
		// 2. STATISTICS BY TOOL
		// ===================================================
		const toolStats = (toolExecutionsData || []).reduce(
			(acc, exec) => {
				const toolName = exec.tool_name || 'unknown';
				if (!acc[toolName]) {
					acc[toolName] = {
						tool_name: toolName,
						tool_category: exec.tool_category || 'unknown',
						total_executions: 0,
						successful_executions: 0,
						failed_executions: 0,
						total_execution_time_ms: 0,
						total_tokens: 0,
						errors: []
					};
				}

				acc[toolName].total_executions += 1;
				if (exec.success) {
					acc[toolName].successful_executions += 1;
				} else {
					acc[toolName].failed_executions += 1;
					if (exec.error_message) {
						acc[toolName].errors.push(exec.error_message);
					}
				}
				acc[toolName].total_execution_time_ms += exec.execution_time_ms || 0;
				acc[toolName].total_tokens += exec.tokens_consumed || 0;

				return acc;
			},
			{} as Record<string, any>
		);

		// Calculate averages and success rates
		const toolStatsList = Object.values(toolStats).map((stat: any) => ({
			tool_name: stat.tool_name,
			tool_category: stat.tool_category,
			total_executions: stat.total_executions,
			successful_executions: stat.successful_executions,
			failed_executions: stat.failed_executions,
			success_rate:
				stat.total_executions > 0
					? (stat.successful_executions / stat.total_executions) * 100
					: 0,
			avg_execution_time_ms:
				stat.total_executions > 0
					? stat.total_execution_time_ms / stat.total_executions
					: 0,
			total_tokens: stat.total_tokens,
			avg_tokens_per_execution:
				stat.total_executions > 0 ? stat.total_tokens / stat.total_executions : 0,
			error_count: stat.errors.length,
			sample_errors: stat.errors.slice(0, 3) // First 3 errors
		}));

		// ===================================================
		// 3. STATISTICS BY CATEGORY
		// ===================================================
		const categoryStats = (toolExecutionsData || []).reduce(
			(acc, exec) => {
				const category = exec.tool_category || 'unknown';
				if (!acc[category]) {
					acc[category] = {
						category,
						total_executions: 0,
						successful_executions: 0,
						failed_executions: 0,
						total_tokens: 0,
						total_execution_time_ms: 0
					};
				}

				acc[category].total_executions += 1;
				if (exec.success) {
					acc[category].successful_executions += 1;
				} else {
					acc[category].failed_executions += 1;
				}
				acc[category].total_tokens += exec.tokens_consumed || 0;
				acc[category].total_execution_time_ms += exec.execution_time_ms || 0;

				return acc;
			},
			{} as Record<string, any>
		);

		const categoryStatsList = Object.values(categoryStats).map((stat: any) => ({
			category: stat.category,
			total_executions: stat.total_executions,
			successful_executions: stat.successful_executions,
			failed_executions: stat.failed_executions,
			success_rate:
				stat.total_executions > 0
					? (stat.successful_executions / stat.total_executions) * 100
					: 0,
			total_tokens: stat.total_tokens,
			avg_tokens_per_execution:
				stat.total_executions > 0 ? stat.total_tokens / stat.total_executions : 0,
			avg_execution_time_ms:
				stat.total_executions > 0 ? stat.total_execution_time_ms / stat.total_executions : 0
		}));

		// ===================================================
		// 4. TOP/BOTTOM TOOLS
		// ===================================================
		// Sort by usage
		const toolsByUsage = [...toolStatsList].sort(
			(a, b) => b.total_executions - a.total_executions
		);
		const topTools = toolsByUsage.slice(0, 10);
		const leastUsedTools = toolsByUsage.slice(-10).reverse();

		// Sort by success rate (only tools with >5 executions for meaningful data)
		const toolsBySuccessRate = toolStatsList
			.filter((t) => t.total_executions >= 5)
			.sort((a, b) => a.success_rate - b.success_rate);
		const mostProblematicTools = toolsBySuccessRate.slice(0, 10);

		// Sort by average execution time
		const toolsBySpeed = [...toolStatsList].sort(
			(a, b) => b.avg_execution_time_ms - a.avg_execution_time_ms
		);
		const slowestTools = toolsBySpeed.slice(0, 10);

		// ===================================================
		// 5. ERROR ANALYSIS
		// ===================================================
		const errorExecutions = (toolExecutionsData || []).filter(
			(e) => !e.success && e.error_message
		);

		// Group errors by error message (simplified - first 100 chars)
		const errorCounts = errorExecutions.reduce(
			(acc, e) => {
				const errorKey = e.error_message?.substring(0, 100) || 'Unknown error';
				if (!acc[errorKey]) {
					acc[errorKey] = {
						error_message: errorKey,
						count: 0,
						affected_tools: new Set()
					};
				}
				acc[errorKey].count += 1;
				acc[errorKey].affected_tools.add(e.tool_name);
				return acc;
			},
			{} as Record<string, any>
		);

		const topErrors = Object.values(errorCounts)
			.map((e: any) => ({
				error_message: e.error_message,
				count: e.count,
				affected_tools: Array.from(e.affected_tools)
			}))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		// ===================================================
		// 6. TOKEN CONSUMPTION
		// ===================================================
		const totalTokens =
			toolExecutionsData?.reduce((sum, e) => sum + (e.tokens_consumed || 0), 0) || 0;
		const avgTokensPerExecution = totalExecutions > 0 ? totalTokens / totalExecutions : 0;

		// Tools by token consumption
		const toolsByTokens = [...toolStatsList]
			.sort((a, b) => b.total_tokens - a.total_tokens)
			.slice(0, 10);

		// ===================================================
		// 7. PERFORMANCE TRENDS (DAILY BREAKDOWN)
		// ===================================================
		const dailyStats = (toolExecutionsData || []).reduce(
			(acc, exec) => {
				const date = exec.created_at.split('T')[0]; // YYYY-MM-DD
				if (!acc[date]) {
					acc[date] = {
						date,
						total_executions: 0,
						successful_executions: 0,
						failed_executions: 0,
						total_tokens: 0,
						total_execution_time_ms: 0
					};
				}

				acc[date].total_executions += 1;
				if (exec.success) {
					acc[date].successful_executions += 1;
				} else {
					acc[date].failed_executions += 1;
				}
				acc[date].total_tokens += exec.tokens_consumed || 0;
				acc[date].total_execution_time_ms += exec.execution_time_ms || 0;

				return acc;
			},
			{} as Record<string, any>
		);

		const trends = Object.values(dailyStats)
			.map((stat: any) => ({
				...stat,
				success_rate:
					stat.total_executions > 0
						? (stat.successful_executions / stat.total_executions) * 100
						: 0,
				avg_execution_time_ms:
					stat.total_executions > 0
						? stat.total_execution_time_ms / stat.total_executions
						: 0
			}))
			.sort((a: any, b: any) => a.date.localeCompare(b.date));

		// ===================================================
		// 8. UNIQUE SESSIONS USING TOOLS
		// ===================================================
		const uniqueSessions = new Set(toolExecutionsData?.map((e) => e.session_id)).size;

		// ===================================================
		// RETURN RESPONSE
		// ===================================================
		return ApiResponse.success({
			overview: {
				total_executions: totalExecutions,
				successful_executions: successfulExecutions,
				failed_executions: failedExecutions,
				success_rate: successRate,
				total_tokens: totalTokens,
				avg_tokens_per_execution: avgTokensPerExecution,
				unique_sessions: uniqueSessions,
				unique_tools_used: Object.keys(toolStats).length,
				unique_categories: Object.keys(categoryStats).length
			},
			by_tool: toolStatsList.sort((a, b) => b.total_executions - a.total_executions),
			by_category: categoryStatsList.sort((a, b) => b.total_executions - a.total_executions),
			top_tools: topTools,
			least_used_tools: leastUsedTools,
			most_problematic_tools: mostProblematicTools,
			slowest_tools: slowestTools,
			tools_by_tokens: toolsByTokens,
			errors: {
				top_errors: topErrors,
				total_errors: errorExecutions.length
			},
			trends: trends
		});
	} catch (err) {
		console.error('Tool analytics error:', err);
		return ApiResponse.internalError(err, 'Failed to load tool analytics');
	}
};
