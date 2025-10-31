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
		// Token usage from chat_messages (uses total_tokens, not tokens_used)
		const { data: messageTokensData, error: messageTokensError } = await supabase
			.from('chat_messages')
			.select('total_tokens, created_at')
			.gte('created_at', startDate.toISOString())
			.not('total_tokens', 'is', null);

		if (messageTokensError) throw messageTokensError;

		const messageTokens =
			messageTokensData?.reduce((sum, msg) => sum + (msg.total_tokens || 0), 0) || 0;

		// Token usage from agent_chat_messages
		const { data: agentMessageTokensData, error: agentMessageTokensError } = await supabase
			.from('agent_chat_messages')
			.select('tokens_used, created_at')
			.gte('created_at', startDate.toISOString())
			.not('tokens_used', 'is', null);

		if (agentMessageTokensError) throw agentMessageTokensError;

		const agentMessageTokens =
			agentMessageTokensData?.reduce((sum, msg) => sum + (msg.tokens_used || 0), 0) || 0;

		const totalTokensUsed = messageTokens + agentMessageTokens;
		const avgTokensPerSession = totalSessions > 0 ? totalTokensUsed / totalSessions : 0;

		// Estimated cost (DeepSeek pricing: ~$0.14 per 1M input, ~$0.28 per 1M output)
		// Simplified: average of $0.21 per 1M tokens
		const estimatedCost = (totalTokensUsed / 1000000) * 0.21;

		// Token trend (compare to previous period)
		const previousPeriodStart = new Date(
			startDate.getTime() - (now.getTime() - startDate.getTime())
		);

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
			previousMessageTokensData?.reduce((sum, msg) => sum + (msg.total_tokens || 0), 0) || 0;
		const previousAgentMessageTokens =
			previousAgentMessageTokensData?.reduce((sum, msg) => sum + (msg.tokens_used || 0), 0) ||
			0;
		const previousTotalTokens = previousMessageTokens + previousAgentMessageTokens;

		const tokenTrendValue =
			previousTotalTokens > 0
				? ((totalTokensUsed - previousTotalTokens) / previousTotalTokens) * 100
				: 0;
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
		// 9. AVG RESPONSE TIME (placeholder - would need actual timing data)
		// ===================================================
		// For now, using a placeholder. In production, you'd track actual response times
		const avgResponseTime = 1500; // milliseconds

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
		const { data: recentMessagesData, error: recentMessagesError } = await supabase
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
			.limit(50);

		if (recentMessagesError) throw recentMessagesError;

		const activityFeed = (recentMessagesData || []).map((msg: any) => ({
			timestamp: msg.created_at,
			type: msg.role,
			user_email: msg.chat_sessions.users.email,
			session_id: msg.session_id,
			details: msg.role === 'user' ? 'sent a message' : 'received assistant response',
			tokens_used: msg.total_tokens
		}));

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

				// Time series data (placeholder - would build from actual data)
				sessionsOverTime: [],
				tokensOverTime: []
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
