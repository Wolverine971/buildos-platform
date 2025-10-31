// apps/web/src/routes/api/admin/chat/costs/+server.ts
/**
 * Cost Analytics API
 *
 * Returns detailed token usage and cost breakdown including:
 * - Input vs output token breakdown
 * - Cost by model (deepseek-chat vs deepseek-coder)
 * - Per-session and per-user costs
 * - Cost trends over time
 * - Highest cost users and sessions
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

// DeepSeek pricing (per 1M tokens)
const PRICING = {
	INPUT_COST_PER_M: 0.14,
	OUTPUT_COST_PER_M: 0.28,
	AVG_COST_PER_M: 0.21 // For when we don't have input/output breakdown
};

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
		// 1. CHAT MESSAGES TOKEN USAGE
		// ===================================================
		const { data: messagesData, error: messagesError } = await supabase
			.from('chat_messages')
			.select('prompt_tokens, completion_tokens, total_tokens, created_at, session_id')
			.gte('created_at', startDate.toISOString())
			.not('total_tokens', 'is', null);

		if (messagesError) throw messagesError;

		const totalPromptTokens =
			messagesData?.reduce((sum, m) => sum + (m.prompt_tokens || 0), 0) || 0;
		const totalCompletionTokens =
			messagesData?.reduce((sum, m) => sum + (m.completion_tokens || 0), 0) || 0;
		const totalChatTokens =
			messagesData?.reduce((sum, m) => sum + (m.total_tokens || 0), 0) || 0;

		const chatInputCost = (totalPromptTokens / 1000000) * PRICING.INPUT_COST_PER_M;
		const chatOutputCost = (totalCompletionTokens / 1000000) * PRICING.OUTPUT_COST_PER_M;
		const totalChatCost = chatInputCost + chatOutputCost;

		// ===================================================
		// 2. AGENT MESSAGES TOKEN USAGE
		// ===================================================
		const { data: agentMessagesData, error: agentMessagesError } = await supabase
			.from('agent_chat_messages')
			.select('tokens_used, model_used, created_at')
			.gte('created_at', startDate.toISOString())
			.not('tokens_used', 'is', null);

		if (agentMessagesError) throw agentMessagesError;

		const totalAgentTokens =
			agentMessagesData?.reduce((sum, m) => sum + (m.tokens_used || 0), 0) || 0;

		// Estimate cost for agent tokens (we don't have input/output breakdown)
		const totalAgentCost = (totalAgentTokens / 1000000) * PRICING.AVG_COST_PER_M;

		// Count by model
		const tokensByModel =
			agentMessagesData?.reduce(
				(acc, m) => {
					const model = m.model_used || 'unknown';
					acc[model] = (acc[model] || 0) + (m.tokens_used || 0);
					return acc;
				},
				{} as Record<string, number>
			) || {};

		// ===================================================
		// 3. TOTAL TOKEN USAGE & COSTS
		// ===================================================
		const totalTokens = totalChatTokens + totalAgentTokens;
		const totalCost = totalChatCost + totalAgentCost;

		// ===================================================
		// 4. PER-SESSION COSTS (TOP 20 HIGHEST)
		// ===================================================
		const { data: sessionsData, error: sessionsError } = await supabase
			.from('chat_sessions')
			.select(
				`
				id,
				title,
				auto_title,
				total_tokens_used,
				created_at,
				users!inner(id, email)
			`
			)
			.gte('created_at', startDate.toISOString())
			.not('total_tokens_used', 'is', null)
			.order('total_tokens_used', { ascending: false })
			.limit(20);

		if (sessionsError) throw sessionsError;

		const topSessions = (sessionsData || []).map((s) => {
			const tokens = s.total_tokens_used || 0;
			const costEstimate = (tokens / 1000000) * PRICING.AVG_COST_PER_M;
			return {
				id: s.id,
				title: s.title || s.auto_title || 'Untitled Session',
				user_email: s.users.email,
				tokens: tokens,
				cost: costEstimate,
				created_at: s.created_at
			};
		});

		// ===================================================
		// 5. PER-USER COSTS (TOP 10 USERS)
		// ===================================================
		const { data: allSessionsData, error: allSessionsError } = await supabase
			.from('chat_sessions')
			.select('user_id, total_tokens_used, users!inner(email)')
			.gte('created_at', startDate.toISOString())
			.not('total_tokens_used', 'is', null);

		if (allSessionsError) throw allSessionsError;

		// Aggregate by user
		const userStats = (allSessionsData || []).reduce(
			(acc, session) => {
				const userId = session.user_id;
				const tokens = session.total_tokens_used || 0;
				const cost = (tokens / 1000000) * PRICING.AVG_COST_PER_M;

				if (!acc[userId]) {
					acc[userId] = {
						user_id: userId,
						email: session.users.email,
						total_tokens: 0,
						total_cost: 0,
						session_count: 0
					};
				}

				acc[userId].total_tokens += tokens;
				acc[userId].total_cost += cost;
				acc[userId].session_count += 1;

				return acc;
			},
			{} as Record<string, any>
		);

		const topUsers = Object.values(userStats)
			.sort((a: any, b: any) => b.total_cost - a.total_cost)
			.slice(0, 10);

		// ===================================================
		// 6. COST TRENDS (DAILY BREAKDOWN)
		// ===================================================
		// Group by date
		const costByDate = (messagesData || []).reduce(
			(acc, msg) => {
				const date = msg.created_at.split('T')[0]; // YYYY-MM-DD
				if (!acc[date]) {
					acc[date] = {
						date,
						prompt_tokens: 0,
						completion_tokens: 0,
						total_tokens: 0,
						input_cost: 0,
						output_cost: 0,
						total_cost: 0
					};
				}

				const promptTokens = msg.prompt_tokens || 0;
				const completionTokens = msg.completion_tokens || 0;
				const totalTokens = msg.total_tokens || 0;

				acc[date].prompt_tokens += promptTokens;
				acc[date].completion_tokens += completionTokens;
				acc[date].total_tokens += totalTokens;
				acc[date].input_cost += (promptTokens / 1000000) * PRICING.INPUT_COST_PER_M;
				acc[date].output_cost += (completionTokens / 1000000) * PRICING.OUTPUT_COST_PER_M;
				acc[date].total_cost += acc[date].input_cost + acc[date].output_cost;

				return acc;
			},
			{} as Record<string, any>
		);

		// Add agent tokens to date breakdown
		(agentMessagesData || []).forEach((msg) => {
			const date = msg.created_at.split('T')[0];
			if (!costByDate[date]) {
				costByDate[date] = {
					date,
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0,
					input_cost: 0,
					output_cost: 0,
					total_cost: 0
				};
			}

			const tokens = msg.tokens_used || 0;
			const cost = (tokens / 1000000) * PRICING.AVG_COST_PER_M;
			costByDate[date].total_tokens += tokens;
			costByDate[date].total_cost += cost;
		});

		const costTrends = Object.values(costByDate).sort((a: any, b: any) =>
			a.date.localeCompare(b.date)
		);

		// ===================================================
		// 7. COMPRESSION SAVINGS
		// ===================================================
		const { data: compressionsData, error: compressionsError } = await supabase
			.from('chat_compressions')
			.select('original_tokens, compressed_tokens, created_at')
			.gte('created_at', startDate.toISOString());

		if (compressionsError) throw compressionsError;

		const tokensSaved =
			compressionsData?.reduce(
				(sum, c) => sum + ((c.original_tokens || 0) - (c.compressed_tokens || 0)),
				0
			) || 0;

		const costSavedByCompression = (tokensSaved / 1000000) * PRICING.AVG_COST_PER_M;

		// ===================================================
		// RETURN RESPONSE
		// ===================================================
		return ApiResponse.success({
			overview: {
				total_tokens: totalTokens,
				total_cost: totalCost,
				chat_tokens: totalChatTokens,
				chat_cost: totalChatCost,
				agent_tokens: totalAgentTokens,
				agent_cost: totalAgentCost,
				prompt_tokens: totalPromptTokens,
				completion_tokens: totalCompletionTokens,
				input_cost: chatInputCost,
				output_cost: chatOutputCost
			},
			by_model: Object.entries(tokensByModel).map(([model, tokens]) => ({
				model,
				tokens,
				cost: (tokens / 1000000) * PRICING.AVG_COST_PER_M
			})),
			top_sessions: topSessions,
			top_users: topUsers,
			cost_trends: costTrends,
			compression_savings: {
				tokens_saved: tokensSaved,
				cost_saved: costSavedByCompression
			},
			pricing: PRICING
		});
	} catch (err) {
		console.error('Cost analytics error:', err);
		return ApiResponse.internalError(err, 'Failed to load cost analytics');
	}
};
