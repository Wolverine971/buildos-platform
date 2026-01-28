// apps/web/src/routes/api/admin/chat/dashboard/+server.ts
/**
 * Chat Monitoring Dashboard API
 *
 * Provides KPIs, activity feed, strategy distribution, and top users
 * for the AI chat monitoring admin interface
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
		const agentUsageFilter = [
			'agent_session_id.not.is.null',
			'agent_plan_id.not.is.null',
			'agent_execution_id.not.is.null',
			'operation_type.ilike.agent_%',
			'operation_type.ilike.planner_%',
			'operation_type.ilike.executor_%',
			'operation_type.ilike.plan_%',
			'operation_type.ilike.strategy_%',
			'operation_type.ilike.response_%',
			'operation_type.ilike.simple_response_%',
			'operation_type.ilike.complex_response_%',
			'operation_type.ilike.streaming_response_%',
			'operation_type.ilike.clarifying_%',
			'operation_type.ilike.project_creation_%'
		].join(',');

		const [
			{ data: usageLogs, error: usageError },
			{ data: sessionsData, error: sessionsError },
			{ data: agentsData, error: agentsError },
			{ data: plansData, error: plansError },
			{ data: executionsData, error: executionsError },
			{ data: recentMessages, error: recentMessagesError },
			{ data: recentPlans, error: recentPlansError },
			{ data: recentExecutions, error: recentExecutionsError },
			{ data: toolMessages, error: toolMessagesError }
		] = await Promise.all([
			supabase
				.from('llm_usage_logs')
				.select(
					'user_id, agent_session_id, agent_plan_id, agent_execution_id, operation_type, total_tokens, total_cost_usd, response_time_ms, created_at'
				)
				.gte('created_at', startDate.toISOString())
				.lte('created_at', now.toISOString())
				.or(agentUsageFilter),
			supabase
				.from('agent_chat_sessions')
				.select('id, status, created_at, user_id, message_count, session_type')
				.gte('created_at', startDate.toISOString())
				.order('created_at', { ascending: false }),
			supabase
				.from('agents')
				.select('id, status, created_at')
				.gte('created_at', startDate.toISOString()),
			supabase
				.from('agent_plans')
				.select('id, status, steps, strategy, created_at, user_id, session_id')
				.gte('created_at', startDate.toISOString()),
			supabase
				.from('agent_executions')
				.select('id, success, created_at, tool_calls_made, user_id, agent_session_id')
				.gte('created_at', startDate.toISOString()),
			supabase
				.from('agent_chat_messages')
				.select(
					'created_at, role, agent_session_id, tokens_used, user_id, tool_calls, tool_call_id, content'
				)
				.gte('created_at', startDate.toISOString())
				.order('created_at', { ascending: false })
				.limit(20),
			supabase
				.from('agent_plans')
				.select('id, strategy, created_at, user_id, session_id')
				.gte('created_at', startDate.toISOString())
				.order('created_at', { ascending: false })
				.limit(20),
			supabase
				.from('agent_executions')
				.select('id, success, created_at, user_id, agent_session_id, tool_calls_made')
				.gte('created_at', startDate.toISOString())
				.order('created_at', { ascending: false })
				.limit(20),
			supabase
				.from('agent_chat_messages')
				.select('content')
				.eq('role', 'tool')
				.gte('created_at', startDate.toISOString())
		]);

		if (usageError) throw usageError;
		if (sessionsError) throw sessionsError;
		if (agentsError) throw agentsError;
		if (plansError) throw plansError;
		if (executionsError) throw executionsError;
		if (recentMessagesError) throw recentMessagesError;
		if (recentPlansError) throw recentPlansError;
		if (recentExecutionsError) throw recentExecutionsError;
		if (toolMessagesError) throw toolMessagesError;

		const usageRows = usageLogs || [];
		const hasUsage = usageRows.length > 0;
		const sessions = sessionsData || [];
		const plans = plansData || [];
		const executions = executionsData || [];

		const totalSessions = sessions.length;
		const activeSessions = sessions.filter((s) => s.status === 'active').length;
		const sessionsOverTime = Object.entries(
			sessions.reduce(
				(acc, session) => {
					const date = session.created_at?.split('T')[0];
					if (!date) return acc;
					acc[date] = (acc[date] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>
			)
		)
			.map(([date, count]) => ({ date, count }))
			.sort((a, b) => a.date.localeCompare(b.date));

		const totalMessages = sessions.reduce(
			(sum, session) => sum + (session.message_count || 0),
			0
		);
		const avgMessagesPerSession = totalSessions > 0 ? totalMessages / totalSessions : 0;
		const uniqueUsers = new Set(sessions.map((s) => s.user_id)).size;

		const totalAgents = (agentsData || []).length;
		const completedAgents = (agentsData || []).filter((a) => a.status === 'completed').length;
		const failedAgents = (agentsData || []).filter((a) => a.status === 'failed').length;
		const finishedAgents = completedAgents + failedAgents;
		const agentSuccessRate = finishedAgents > 0 ? (completedAgents / finishedAgents) * 100 : 0;

		const totalPlans = plans.length;
		const activePlans = plans.filter((p) => p.status === 'executing').length;
		const avgPlanComplexity =
			totalPlans > 0
				? plans.reduce((sum, plan) => {
						const steps = Array.isArray(plan.steps) ? plan.steps.length : 0;
						return sum + steps;
					}, 0) / totalPlans
				: 0;

		const directStrategies = new Set(['planner_stream', 'ask_clarifying_questions']);
		const directPlans = plans.filter((plan) => directStrategies.has(plan.strategy)).length;
		const complexPlans = totalPlans - directPlans;

		let totalTokensUsed = 0;
		let estimatedCost = 0;
		let avgTokensPerSession = 0;
		let avgResponseTime = 1500;
		let tokensOverTime: Array<{ date: string; tokens: number }> = [];
		let tokenTrendValue = 0;
		let messageTokensByUser = new Map<string, number>();

		const previousPeriodStart = new Date(
			startDate.getTime() - (now.getTime() - startDate.getTime())
		);

		if (hasUsage) {
			totalTokensUsed = usageRows.reduce((sum, row) => sum + (row.total_tokens || 0), 0);
			estimatedCost = usageRows.reduce(
				(sum, row) => sum + Number(row.total_cost_usd || 0),
				0
			);
			avgTokensPerSession = totalSessions > 0 ? totalTokensUsed / totalSessions : 0;
			avgResponseTime =
				usageRows.length > 0
					? usageRows.reduce((sum, row) => sum + (row.response_time_ms || 0), 0) /
						usageRows.length
					: 0;

			const tokensByDate = usageRows.reduce(
				(acc, row) => {
					const date = row.created_at?.split('T')[0];
					if (!date) return acc;
					acc[date] = (acc[date] || 0) + (row.total_tokens || 0);
					return acc;
				},
				{} as Record<string, number>
			);

			tokensOverTime = Object.entries(tokensByDate)
				.map(([date, tokens]) => ({ date, tokens }))
				.sort((a, b) => a.date.localeCompare(b.date));

			const { data: previousUsageLogs, error: previousUsageError } = await supabase
				.from('llm_usage_logs')
				.select('total_tokens')
				.gte('created_at', previousPeriodStart.toISOString())
				.lt('created_at', startDate.toISOString())
				.or(agentUsageFilter);

			if (previousUsageError) throw previousUsageError;

			const previousTotalTokens =
				previousUsageLogs?.reduce((sum, row) => sum + (row.total_tokens || 0), 0) || 0;
			tokenTrendValue =
				previousTotalTokens > 0
					? ((totalTokensUsed - previousTotalTokens) / previousTotalTokens) * 100
					: 0;
		} else {
			const { data: messageTokensData, error: messageTokensError } = await supabase
				.from('agent_chat_messages')
				.select('tokens_used, created_at, user_id')
				.gte('created_at', startDate.toISOString())
				.not('tokens_used', 'is', null);

			if (messageTokensError) throw messageTokensError;

			const messagesData = messageTokensData || [];
			totalTokensUsed = messagesData.reduce((sum, msg) => sum + (msg.tokens_used || 0), 0);
			estimatedCost = (totalTokensUsed / 1000000) * 0.21;
			avgTokensPerSession = totalSessions > 0 ? totalTokensUsed / totalSessions : 0;

			const tokensByDate = messagesData.reduce(
				(acc, msg) => {
					const date = msg.created_at?.split('T')[0];
					if (!date) return acc;
					acc[date] = (acc[date] || 0) + (msg.tokens_used || 0);
					return acc;
				},
				{} as Record<string, number>
			);

			tokensOverTime = Object.entries(tokensByDate)
				.map(([date, tokens]) => ({ date, tokens }))
				.sort((a, b) => a.date.localeCompare(b.date));

			messageTokensByUser = messagesData.reduce((acc, msg) => {
				if (!msg.user_id) return acc;
				acc.set(msg.user_id, (acc.get(msg.user_id) || 0) + (msg.tokens_used || 0));
				return acc;
			}, new Map<string, number>());

			const { data: previousMessageTokensData, error: previousMessageTokensError } =
				await supabase
					.from('agent_chat_messages')
					.select('tokens_used')
					.gte('created_at', previousPeriodStart.toISOString())
					.lt('created_at', startDate.toISOString())
					.not('tokens_used', 'is', null);

			if (previousMessageTokensError) throw previousMessageTokensError;

			const previousTotalTokens =
				previousMessageTokensData?.reduce((sum, msg) => sum + (msg.tokens_used || 0), 0) ||
				0;

			tokenTrendValue =
				previousTotalTokens > 0
					? ((totalTokensUsed - previousTotalTokens) / previousTotalTokens) * 100
					: 0;
		}

		const tokenTrend = {
			direction: tokenTrendValue >= 0 ? 'up' : 'down',
			value: Math.abs(tokenTrendValue)
		};

		const toolRows = toolMessages || [];
		let successfulToolExecutions = 0;
		toolRows.forEach((msg) => {
			if (!msg.content) return;
			try {
				const parsed = JSON.parse(msg.content);
				if (parsed?.success === true) {
					successfulToolExecutions += 1;
				}
			} catch {
				// Ignore parse errors from non-JSON tool payloads
			}
		});
		const totalToolExecutions = toolRows.length;
		const toolSuccessRate =
			totalToolExecutions > 0 ? (successfulToolExecutions / totalToolExecutions) * 100 : 0;

		const compressionEffectiveness = 0;
		const failedSessions = sessions.filter((s) => s.status === 'failed').length;
		const errorRate = totalSessions > 0 ? (failedSessions / totalSessions) * 100 : 0;

		const activityUserIds = Array.from(
			new Set(
				[
					...sessions.map((s) => s.user_id),
					...(recentMessages || []).map((msg) => msg.user_id),
					...(recentPlans || []).map((plan) => plan.user_id),
					...(recentExecutions || []).map((execution) => execution.user_id)
				].filter(Boolean)
			)
		) as string[];

		const { data: activityUsers, error: activityUsersError } = activityUserIds.length
			? await supabase.from('users').select('id, email').in('id', activityUserIds)
			: { data: [], error: null };

		if (activityUsersError) throw activityUsersError;

		const emailByUserId = new Map((activityUsers || []).map((user) => [user.id, user.email]));

		const activityEvents: Array<{
			timestamp: string;
			type: string;
			user_email: string;
			session_id: string;
			details: string;
			tokens_used?: number;
		}> = [];

		(recentMessages || []).forEach((msg) => {
			let type = 'message';
			let details = msg.role === 'user' ? 'sent a message' : 'agent responded';

			if (msg.role === 'tool') {
				type = 'tool_execution';
				details = 'returned tool result';
			}

			activityEvents.push({
				timestamp: msg.created_at,
				type,
				user_email: emailByUserId.get(msg.user_id) || 'Unknown',
				session_id: msg.agent_session_id,
				details,
				tokens_used: msg.tokens_used || undefined
			});
		});

		(recentPlans || []).forEach((plan) => {
			activityEvents.push({
				timestamp: plan.created_at,
				type: 'plan_created',
				user_email: emailByUserId.get(plan.user_id) || 'Unknown',
				session_id: plan.session_id,
				details: `created a ${plan.strategy || 'multi-step'} plan`
			});
		});

		(recentExecutions || []).forEach((execution) => {
			activityEvents.push({
				timestamp: execution.created_at,
				type: execution.success ? 'execution' : 'error',
				user_email: emailByUserId.get(execution.user_id) || 'Unknown',
				session_id: execution.agent_session_id,
				details: execution.success ? 'executor run completed' : 'executor run failed'
			});
		});

		const activityFeed = activityEvents
			.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
			.slice(0, 50);

		const usageTokensByUser = new Map<string, number>();
		if (hasUsage) {
			usageRows.forEach((row) => {
				if (!row.user_id) return;
				usageTokensByUser.set(
					row.user_id,
					(usageTokensByUser.get(row.user_id) || 0) + (row.total_tokens || 0)
				);
			});
		}

		const userStats = new Map<
			string,
			{
				user_id: string;
				email: string;
				session_count: number;
				message_count: number;
				tokens_used: number;
			}
		>();

		sessions.forEach((session) => {
			const userId = session.user_id;
			const existing = userStats.get(userId);
			if (existing) {
				existing.session_count += 1;
				existing.message_count += session.message_count || 0;
			} else {
				userStats.set(userId, {
					user_id: userId,
					email: emailByUserId.get(userId) || 'Unknown',
					session_count: 1,
					message_count: session.message_count || 0,
					tokens_used: 0
				});
			}
		});

		if (hasUsage && usageTokensByUser.size > 0) {
			userStats.forEach((stats, userId) => {
				const usageTokens = usageTokensByUser.get(userId);
				if (typeof usageTokens === 'number') {
					stats.tokens_used = usageTokens;
				}
			});
		} else if (messageTokensByUser.size > 0) {
			userStats.forEach((stats, userId) => {
				const usageTokens = messageTokensByUser.get(userId);
				if (typeof usageTokens === 'number') {
					stats.tokens_used = usageTokens;
				}
			});
		}

		const topUsers = Array.from(userStats.values())
			.sort((a, b) => b.session_count - a.session_count)
			.slice(0, 10);

		return ApiResponse.success({
			kpis: {
				// User Engagement
				totalSessions,
				activeSessions,
				totalMessages,
				avgMessagesPerSession,
				uniqueUsers,

				// Agent Performance
				totalAgents,
				activePlans,
				agentSuccessRate,
				avgPlanComplexity,

				// Cost & Usage
				totalTokensUsed,
				estimatedCost,
				avgTokensPerSession,
				tokenTrend,

				// Quality Metrics
				compressionEffectiveness,
				toolSuccessRate,
				avgResponseTime,
				errorRate,

				// Time series data
				sessionsOverTime,
				tokensOverTime
			},
			activity_feed: activityFeed,
			strategy_distribution: {
				direct: directPlans,
				complex: complexPlans
			},
			top_users: topUsers
		});
	} catch (err) {
		console.error('Chat dashboard error:', err);
		return ApiResponse.internalError(err, 'Failed to load chat dashboard');
	}
};
