// apps/web/src/routes/api/admin/chat/agents/+server.ts
/**
 * Agent Analytics API
 *
 * Returns comprehensive agent performance metrics including:
 * - Agent execution breakdown by type
 * - Success rates and error analysis
 * - Token usage by agent
 * - Duration metrics
 * - Agent conversation summaries
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
		// 1. AGENT OVERVIEW METRICS
		// ===================================================
		const { data: agentsData, error: agentsError } = await supabase
			.from('agents')
			.select('id, type, status, model_preference, created_at, completed_at')
			.gte('created_at', startDate.toISOString());

		if (agentsError) throw agentsError;

		const totalAgents = agentsData?.length || 0;
		const plannerAgents = agentsData?.filter((a) => a.type === 'planner').length || 0;
		const executorAgents = agentsData?.filter((a) => a.type === 'executor').length || 0;
		const completedAgents = agentsData?.filter((a) => a.status === 'completed').length || 0;
		const failedAgents = agentsData?.filter((a) => a.status === 'failed').length || 0;
		const activeAgents = agentsData?.filter((a) => a.status === 'active').length || 0;

		const finishedAgents = completedAgents + failedAgents;
		const successRate = finishedAgents > 0 ? (completedAgents / finishedAgents) * 100 : 0;

		// Calculate average duration for completed agents
		const completedWithDuration =
			agentsData?.filter((a) => a.status === 'completed' && a.created_at && a.completed_at) ||
			[];

		const avgDurationMs =
			completedWithDuration.length > 0
				? completedWithDuration.reduce((sum, a) => {
						const duration =
							new Date(a.completed_at!).getTime() - new Date(a.created_at).getTime();
						return sum + duration;
					}, 0) / completedWithDuration.length
				: 0;

		// ===================================================
		// 2. AGENT EXECUTIONS WITH TOKEN USAGE
		// ===================================================
		const { data: executionsData, error: executionsError } = await supabase
			.from('agent_executions')
			.select(
				'id, executor_agent_id, success, error, tokens_used, duration_ms, tool_calls_made, message_count, created_at'
			)
			.gte('created_at', startDate.toISOString());

		if (executionsError) throw executionsError;

		const totalExecutions = executionsData?.length || 0;
		const successfulExecutions = executionsData?.filter((e) => e.success === true).length || 0;
		const failedExecutions = executionsData?.filter((e) => e.success === false).length || 0;
		const executionSuccessRate =
			totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

		const totalTokensUsed =
			executionsData?.reduce((sum, e) => sum + (e.tokens_used || 0), 0) || 0;
		const avgTokensPerExecution = totalExecutions > 0 ? totalTokensUsed / totalExecutions : 0;

		const totalToolCalls =
			executionsData?.reduce((sum, e) => sum + (e.tool_calls_made || 0), 0) || 0;
		const avgToolCallsPerExecution = totalExecutions > 0 ? totalToolCalls / totalExecutions : 0;

		const avgExecutionDuration =
			executionsData && executionsData.length > 0
				? executionsData.reduce((sum, e) => sum + (e.duration_ms || 0), 0) /
					executionsData.length
				: 0;

		// ===================================================
		// 3. AGENT PLANS (STRATEGY BREAKDOWN)
		// ===================================================
		const { data: plansData, error: plansError } = await supabase
			.from('agent_plans')
			.select('id, strategy, status, created_at')
			.gte('created_at', startDate.toISOString());

		if (plansError) throw plansError;

		const totalPlans = plansData?.length || 0;
		const directPlans =
			plansData?.filter((p) => (p.strategy as string) === 'direct').length || 0;
		const complexPlans =
			plansData?.filter((p) => (p.strategy as string) === 'complex').length || 0;
		const completedPlans = plansData?.filter((p) => p.status === 'completed').length || 0;
		const failedPlans = plansData?.filter((p) => p.status === 'failed').length || 0;
		const activePlans = plansData?.filter((p) => p.status === 'executing').length || 0;

		// ===================================================
		// 4. AGENT CHAT SESSIONS (CONVERSATIONS)
		// ===================================================
		const { data: agentSessionsData, error: agentSessionsError } = await supabase
			.from('agent_chat_sessions')
			.select('id, session_type, status, message_count, created_at, completed_at')
			.gte('created_at', startDate.toISOString());

		if (agentSessionsError) throw agentSessionsError;

		const totalConversations = agentSessionsData?.length || 0;
		const plannerThinkingSessions =
			agentSessionsData?.filter((s) => s.session_type === 'planner_thinking').length || 0;
		const plannerExecutorSessions =
			agentSessionsData?.filter((s) => s.session_type === 'planner_executor').length || 0;
		const completedConversations =
			agentSessionsData?.filter((s) => s.status === 'completed').length || 0;
		const failedConversations =
			agentSessionsData?.filter((s) => s.status === 'failed').length || 0;

		const avgMessagesPerConversation =
			totalConversations > 0
				? agentSessionsData.reduce((sum, s) => sum + (s.message_count || 0), 0) /
					totalConversations
				: 0;

		// ===================================================
		// 5. ERROR ANALYSIS
		// ===================================================
		// Get agent executions with errors
		const errorExecutions = executionsData?.filter((e) => e.error) || [];

		// Group errors by error message (simplified)
		const errorCounts = errorExecutions.reduce(
			(acc, e) => {
				const errorKey = e.error?.substring(0, 100) || 'Unknown error'; // First 100 chars
				acc[errorKey] = (acc[errorKey] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		);

		const topErrors = Object.entries(errorCounts)
			.sort(([, a], [, b]) => b - a)
			.slice(0, 10)
			.map(([error, count]) => ({ error, count }));

		// ===================================================
		// 6. RECENT AGENT ACTIVITY
		// ===================================================
		const { data: recentExecutions, error: recentError } = await supabase
			.from('agent_executions')
			.select(
				`
				id,
				success,
				tokens_used,
				duration_ms,
				tool_calls_made,
				created_at,
				agents!fk_agent_executions_executor(id, type, name),
				agent_plans!inner(user_message)
			`
			)
			.gte('created_at', startDate.toISOString())
			.order('created_at', { ascending: false })
			.limit(20);

		if (recentError) throw recentError;

		const recentActivity = (recentExecutions || []).map((e: any) => ({
			id: e.id,
			agent_name: e.agents?.name || 'Unknown Agent',
			agent_type: e.agents?.type || 'unknown',
			user_message: e.agent_plans?.user_message || '',
			success: e.success,
			tokens_used: e.tokens_used || 0,
			duration_ms: e.duration_ms || 0,
			tool_calls: e.tool_calls_made || 0,
			created_at: e.created_at
		}));

		// ===================================================
		// RETURN RESPONSE
		// ===================================================
		return ApiResponse.success({
			overview: {
				total_agents: totalAgents,
				planner_agents: plannerAgents,
				executor_agents: executorAgents,
				completed_agents: completedAgents,
				failed_agents: failedAgents,
				active_agents: activeAgents,
				success_rate: successRate,
				avg_duration_ms: avgDurationMs
			},
			executions: {
				total: totalExecutions,
				successful: successfulExecutions,
				failed: failedExecutions,
				success_rate: executionSuccessRate,
				total_tokens_used: totalTokensUsed,
				avg_tokens_per_execution: avgTokensPerExecution,
				total_tool_calls: totalToolCalls,
				avg_tool_calls: avgToolCallsPerExecution,
				avg_duration_ms: avgExecutionDuration
			},
			plans: {
				total: totalPlans,
				direct: directPlans,
				complex: complexPlans,
				completed: completedPlans,
				failed: failedPlans,
				active: activePlans
			},
			conversations: {
				total: totalConversations,
				planner_thinking: plannerThinkingSessions,
				planner_executor: plannerExecutorSessions,
				completed: completedConversations,
				failed: failedConversations,
				avg_messages: avgMessagesPerConversation
			},
			errors: {
				top_errors: topErrors,
				total_errors: errorExecutions.length
			},
			recent_activity: recentActivity
		});
	} catch (err) {
		console.error('Agent analytics error:', err);
		return ApiResponse.internalError(err, 'Failed to load agent analytics');
	}
};
