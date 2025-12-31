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
		const chatUsageFilter = [
			'chat_session_id.not.is.null',
			'agent_session_id.not.is.null',
			'agent_plan_id.not.is.null',
			'agent_execution_id.not.is.null',
			'operation_type.ilike.chat_%',
			'operation_type.ilike.agent_%',
			'operation_type.ilike.planner_%',
			'operation_type.ilike.executor_%',
			'operation_type.ilike.plan_%',
			'operation_type.ilike.strategy_%',
			'operation_type.ilike.response_%',
			'operation_type.ilike.clarifying_%'
		].join(',');

		const { data: usageLogs, error: usageError } = await supabase
			.from('llm_usage_logs')
			.select(
				'user_id, chat_session_id, agent_session_id, agent_plan_id, agent_execution_id, operation_type, total_tokens, total_cost_usd, response_time_ms, created_at'
			)
			.gte('created_at', startDate.toISOString())
			.lte('created_at', now.toISOString())
			.or(chatUsageFilter);

		if (usageError) throw usageError;

		const usageRows = usageLogs || [];
		const hasUsage = usageRows.length > 0;

		// ===================================================
		// 1. TOTAL SESSIONS (active and completed)
		// ===================================================
		const { data: sessionsData, error: sessionsError } = await supabase
			.from('chat_sessions')
			.select('id, status, created_at')
			.gte('created_at', startDate.toISOString())
			.order('created_at', { ascending: false });

		if (sessionsError) throw sessionsError;

		const totalSessions = sessionsData?.length || 0;
		const activeSessions = sessionsData?.filter((s) => s.status === 'active').length || 0;
		const sessionsOverTime = Object.entries(
			(sessionsData || []).reduce(
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

		// ===================================================
		// 2. TOTAL MESSAGES & AVG MESSAGES PER SESSION
		// ===================================================
		const { data: messagesData, error: messagesError } = await supabase
			.from('chat_messages')
			.select('id, session_id, created_at')
			.gte('created_at', startDate.toISOString());

		if (messagesError) throw messagesError;

		const totalMessages = messagesData?.length || 0;
		const avgMessagesPerSession = totalSessions > 0 ? totalMessages / totalSessions : 0;

		// ===================================================
		// 3. UNIQUE USERS
		// ===================================================
		const { data: uniqueUsersData, error: uniqueUsersError } = await supabase
			.from('chat_sessions')
			.select('user_id')
			.gte('created_at', startDate.toISOString());

		if (uniqueUsersError) throw uniqueUsersError;

		const uniqueUsers = new Set(uniqueUsersData?.map((u) => u.user_id)).size;

		// ===================================================
		// 4. AGENT METRICS
		// ===================================================
		const { data: agentsData, error: agentsError } = await supabase
			.from('agents')
			.select('id, type, status, created_at')
			.gte('created_at', startDate.toISOString());

		if (agentsError) throw agentsError;

		const totalAgents = agentsData?.length || 0;
		const completedAgents = agentsData?.filter((a) => a.status === 'completed').length || 0;
		const failedAgents = agentsData?.filter((a) => a.status === 'failed').length || 0;
		const finishedAgents = completedAgents + failedAgents;
		const agentSuccessRate = finishedAgents > 0 ? (completedAgents / finishedAgents) * 100 : 0;

		// ===================================================
		// 5. AGENT PLANS (active and total)
		// ===================================================
		const { data: plansData, error: plansError } = await supabase
			.from('agent_plans')
			.select('id, status, steps, strategy, created_at')
			.gte('created_at', startDate.toISOString());

		if (plansError) throw plansError;

		const activePlans = plansData?.filter((p) => p.status === 'executing').length || 0;
		const totalPlans = plansData?.length || 0;

		// Calculate average plan complexity (steps per plan)
		const avgPlanComplexity =
			totalPlans > 0
				? plansData.reduce((sum, plan) => {
						const steps = Array.isArray(plan.steps) ? plan.steps.length : 0;
						return sum + steps;
					}, 0) / totalPlans
				: 0;

		// Strategy distribution
		const directPlans = plansData?.filter((p) => p.strategy === 'direct').length || 0;
		const complexPlans = plansData?.filter((p) => p.strategy === 'complex').length || 0;

		// ===================================================
		// 6. TOKEN USAGE & COSTS
		// ===================================================
		let totalTokensUsed = 0;
		let estimatedCost = 0;
		let avgTokensPerSession = 0;
		let avgResponseTime = 1500;
		let tokensOverTime: Array<{ date: string; tokens: number }> = [];

		const previousPeriodStart = new Date(
			startDate.getTime() - (now.getTime() - startDate.getTime())
		);

		let tokenTrendValue = 0;

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
				.or(chatUsageFilter);

			if (previousUsageError) throw previousUsageError;

			const previousTotalTokens =
				previousUsageLogs?.reduce((sum, row) => sum + (row.total_tokens || 0), 0) || 0;
			tokenTrendValue =
				previousTotalTokens > 0
					? ((totalTokensUsed - previousTotalTokens) / previousTotalTokens) * 100
					: 0;
		} else {
			const { data: messageTokensData, error: messageTokensError } = await supabase
				.from('chat_messages')
				.select('total_tokens, created_at')
				.gte('created_at', startDate.toISOString())
				.not('total_tokens', 'is', null);

			if (messageTokensError) throw messageTokensError;

			const messageTokens =
				messageTokensData?.reduce((sum, msg) => sum + (msg.total_tokens || 0), 0) || 0;

			const { data: agentMessageTokensData, error: agentMessageTokensError } = await supabase
				.from('agent_chat_messages')
				.select('tokens_used, created_at')
				.gte('created_at', startDate.toISOString())
				.not('tokens_used', 'is', null);

			if (agentMessageTokensError) throw agentMessageTokensError;

			const agentMessageTokens =
				agentMessageTokensData?.reduce((sum, msg) => sum + (msg.tokens_used || 0), 0) || 0;

			totalTokensUsed = messageTokens + agentMessageTokens;
			avgTokensPerSession = totalSessions > 0 ? totalTokensUsed / totalSessions : 0;
			estimatedCost = (totalTokensUsed / 1000000) * 0.21;

			const tokensByDate = (messageTokensData || []).reduce(
				(acc, msg) => {
					const date = msg.created_at?.split('T')[0];
					if (!date) return acc;
					acc[date] = (acc[date] || 0) + (msg.total_tokens || 0);
					return acc;
				},
				{} as Record<string, number>
			);

			(agentMessageTokensData || []).forEach((msg) => {
				const date = msg.created_at?.split('T')[0];
				if (!date) return;
				tokensByDate[date] = (tokensByDate[date] || 0) + (msg.tokens_used || 0);
			});

			tokensOverTime = Object.entries(tokensByDate)
				.map(([date, tokens]) => ({ date, tokens }))
				.sort((a, b) => a.date.localeCompare(b.date));

			const { data: previousMessageTokensData } = await supabase
				.from('chat_messages')
				.select('total_tokens')
				.gte('created_at', previousPeriodStart.toISOString())
				.lt('created_at', startDate.toISOString())
				.not('total_tokens', 'is', null);

			const { data: previousAgentMessageTokensData } = await supabase
				.from('agent_chat_messages')
				.select('tokens_used')
				.gte('created_at', previousPeriodStart.toISOString())
				.lt('created_at', startDate.toISOString())
				.not('tokens_used', 'is', null);

			const previousMessageTokens =
				previousMessageTokensData?.reduce((sum, msg) => sum + (msg.total_tokens || 0), 0) ||
				0;
			const previousAgentMessageTokens =
				previousAgentMessageTokensData?.reduce(
					(sum, msg) => sum + (msg.tokens_used || 0),
					0
				) || 0;
			const previousTotalTokens = previousMessageTokens + previousAgentMessageTokens;

			tokenTrendValue =
				previousTotalTokens > 0
					? ((totalTokensUsed - previousTotalTokens) / previousTotalTokens) * 100
					: 0;
		}

		const tokenTrend = {
			direction: tokenTrendValue >= 0 ? 'up' : 'down',
			value: Math.abs(tokenTrendValue)
		};

		// ===================================================
		// 7. COMPRESSION EFFECTIVENESS
		// ===================================================
		const { data: compressionsData, error: compressionsError } = await supabase
			.from('chat_compressions')
			.select('original_tokens, compressed_tokens, created_at')
			.gte('created_at', startDate.toISOString());

		if (compressionsError) throw compressionsError;

		// Calculate tokens saved: original_tokens - compressed_tokens
		const totalTokensSaved =
			compressionsData?.reduce(
				(sum, c) => sum + ((c.original_tokens || 0) - (c.compressed_tokens || 0)),
				0
			) || 0;
		const totalOriginalTokens =
			compressionsData?.reduce((sum, c) => sum + (c.original_tokens || 0), 0) || 0;
		const compressionEffectiveness =
			totalOriginalTokens > 0 ? (totalTokensSaved / totalOriginalTokens) * 100 : 0;

		// ===================================================
		// 8. TOOL SUCCESS RATE
		// ===================================================
		const { data: toolExecutionsData, error: toolExecutionsError } = await supabase
			.from('chat_tool_executions')
			.select('success, created_at')
			.gte('created_at', startDate.toISOString());

		if (toolExecutionsError) throw toolExecutionsError;

		const totalToolExecutions = toolExecutionsData?.length || 0;
		const successfulToolExecutions =
			toolExecutionsData?.filter((t) => t.success === true).length || 0;
		const toolSuccessRate =
			totalToolExecutions > 0 ? (successfulToolExecutions / totalToolExecutions) * 100 : 0;

		// ===================================================
		// 10. ERROR RATE
		// ===================================================
		// Calculate error rate from messages with errors and failed tool executions
		const { data: errorMessagesData, error: errorMessagesError } = await supabase
			.from('chat_messages')
			.select('session_id')
			.gte('created_at', startDate.toISOString())
			.not('error_message', 'is', null);

		if (errorMessagesError) throw errorMessagesError;

		// Count unique sessions with errors
		const sessionsWithErrors = new Set(errorMessagesData?.map((m) => m.session_id)).size;
		const errorRate = totalSessions > 0 ? (sessionsWithErrors / totalSessions) * 100 : 0;

		// ===================================================
		// 11. ACTIVITY FEED (last 50 events)
		// ===================================================
		const [
			{ data: recentMessagesData, error: recentMessagesError },
			{ data: recentPlansData, error: recentPlansError },
			{ data: recentToolExecutionsData, error: recentToolExecutionsError },
			{ data: recentCompressionsData, error: recentCompressionsError }
		] = await Promise.all([
			supabase
				.from('chat_messages')
				.select(
					`
				created_at,
				role,
				session_id,
				total_tokens,
				chat_sessions!inner(
					user_id,
					users!inner(email)
				)
			`
				)
				.gte('created_at', startDate.toISOString())
				.order('created_at', { ascending: false })
				.limit(20),
			supabase
				.from('agent_plans')
				.select(
					'id, created_at, strategy, session_id, user_id, users!agent_plans_user_id_fkey(email)'
				)
				.gte('created_at', startDate.toISOString())
				.order('created_at', { ascending: false })
				.limit(20),
			supabase
				.from('chat_tool_executions')
				.select(
					`
				created_at,
				success,
				tool_name,
				tokens_consumed,
				session_id,
				chat_sessions!inner(users!inner(email))
			`
				)
				.gte('created_at', startDate.toISOString())
				.order('created_at', { ascending: false })
				.limit(20),
			supabase
				.from('chat_compressions')
				.select(
					`
				created_at,
				original_tokens,
				compressed_tokens,
				session_id,
				chat_sessions!inner(users!inner(email))
			`
				)
				.gte('created_at', startDate.toISOString())
				.order('created_at', { ascending: false })
				.limit(20)
		]);

		if (recentMessagesError) throw recentMessagesError;
		if (recentPlansError) throw recentPlansError;
		if (recentToolExecutionsError) throw recentToolExecutionsError;
		if (recentCompressionsError) throw recentCompressionsError;

		const activityEvents: Array<{
			timestamp: string;
			type: string;
			user_email: string;
			session_id: string;
			details: string;
			tokens_used?: number;
		}> = [];

		(recentMessagesData || []).forEach((msg: any) => {
			activityEvents.push({
				timestamp: msg.created_at,
				type: 'message',
				user_email: msg.chat_sessions.users.email,
				session_id: msg.session_id,
				details: msg.role === 'user' ? 'sent a message' : 'received assistant response',
				tokens_used: msg.total_tokens || undefined
			});
		});

		(recentPlansData || []).forEach((plan: any) => {
			activityEvents.push({
				timestamp: plan.created_at,
				type: 'plan_created',
				user_email: plan.users?.email || 'Unknown',
				session_id: plan.session_id,
				details: `created a ${plan.strategy || 'multi-step'} plan`
			});
		});

		(recentToolExecutionsData || []).forEach((tool: any) => {
			const success = tool.success === true;
			activityEvents.push({
				timestamp: tool.created_at,
				type: success ? 'tool_execution' : 'error',
				user_email: tool.chat_sessions?.users?.email || 'Unknown',
				session_id: tool.session_id,
				details: success
					? `ran tool ${tool.tool_name || 'unknown_tool'}`
					: `tool ${tool.tool_name || 'unknown_tool'} failed`,
				tokens_used: tool.tokens_consumed || undefined
			});
		});

		(recentCompressionsData || []).forEach((compression: any) => {
			const tokensSaved =
				(compression.original_tokens || 0) - (compression.compressed_tokens || 0);
			activityEvents.push({
				timestamp: compression.created_at,
				type: 'compression',
				user_email: compression.chat_sessions?.users?.email || 'Unknown',
				session_id: compression.session_id,
				details: 'compressed conversation',
				tokens_used: tokensSaved > 0 ? tokensSaved : undefined
			});
		});

		const activityFeed = activityEvents
			.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
			.slice(0, 50);

		// ===================================================
		// 12. TOP USERS BY ACTIVITY
		// ===================================================
		const { data: topUsersData, error: topUsersError } = await supabase
			.from('chat_sessions')
			.select(
				`
        user_id,
        id,
        total_tokens_used,
        message_count,
        users!inner(email)
      `
			)
			.gte('created_at', startDate.toISOString());

		if (topUsersError) throw topUsersError;

		const usageTokensByUser = new Map<string, number>();
		if (hasUsage) {
			usageRows.forEach((row) => {
				if (!row.user_id) return;
				const current = usageTokensByUser.get(row.user_id) || 0;
				usageTokensByUser.set(row.user_id, current + (row.total_tokens || 0));
			});
		}

		// Aggregate by user
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

		(topUsersData || []).forEach((session: any) => {
			const userId = session.user_id;
			const existing = userStats.get(userId);

			if (existing) {
				existing.session_count++;
				existing.message_count += session.message_count || 0;
				existing.tokens_used += session.total_tokens_used || 0;
			} else {
				userStats.set(userId, {
					user_id: userId,
					email: session.users.email,
					session_count: 1,
					message_count: session.message_count || 0,
					tokens_used: session.total_tokens_used || 0
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
		}

		const topUsers = Array.from(userStats.values())
			.sort((a, b) => b.session_count - a.session_count)
			.slice(0, 10);

		// ===================================================
		// RETURN DASHBOARD DATA
		// ===================================================
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
