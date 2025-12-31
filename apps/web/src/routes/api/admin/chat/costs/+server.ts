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
				'user_id, chat_session_id, agent_session_id, agent_plan_id, agent_execution_id, operation_type, model_used, prompt_tokens, completion_tokens, total_tokens, input_cost_usd, output_cost_usd, total_cost_usd, created_at'
			)
			.gte('created_at', startDate.toISOString())
			.lte('created_at', now.toISOString())
			.or(chatUsageFilter);

		if (usageError) throw usageError;

		const usageRows = usageLogs || [];

		if (usageRows.length > 0) {
			const totals = {
				promptTokens: 0,
				completionTokens: 0,
				totalTokens: 0,
				inputCost: 0,
				outputCost: 0,
				totalCost: 0,
				chatTokens: 0,
				chatCost: 0,
				agentTokens: 0,
				agentCost: 0
			};

			const modelStats = new Map<string, { tokens: number; cost: number }>();
			const costByDate: Record<string, any> = {};
			const sessionStats = new Map<string, { tokens: number; cost: number }>();
			const userStats = new Map<
				string,
				{
					user_id: string;
					total_tokens: number;
					total_cost: number;
					session_ids: Set<string>;
				}
			>();

			const agentPrefix =
				/^(agent_|planner_|executor_|plan_|strategy_|response_|clarifying_)/i;

			for (const row of usageRows) {
				const promptTokens = row.prompt_tokens || 0;
				const completionTokens = row.completion_tokens || 0;
				const totalTokens = row.total_tokens || 0;
				const inputCost = Number(row.input_cost_usd || 0);
				const outputCost = Number(row.output_cost_usd || 0);
				const totalCost = Number(row.total_cost_usd || 0);

				totals.promptTokens += promptTokens;
				totals.completionTokens += completionTokens;
				totals.totalTokens += totalTokens;
				totals.inputCost += inputCost;
				totals.outputCost += outputCost;
				totals.totalCost += totalCost;

				const operationType = String(row.operation_type || '');
				const isAgent =
					!!(row.agent_session_id || row.agent_plan_id || row.agent_execution_id) ||
					agentPrefix.test(operationType);

				if (isAgent) {
					totals.agentTokens += totalTokens;
					totals.agentCost += totalCost;
				} else {
					totals.chatTokens += totalTokens;
					totals.chatCost += totalCost;
				}

				const model = row.model_used || 'unknown';
				const modelEntry = modelStats.get(model) || { tokens: 0, cost: 0 };
				modelEntry.tokens += totalTokens;
				modelEntry.cost += totalCost;
				modelStats.set(model, modelEntry);

				const date = row.created_at?.split('T')[0];
				if (date) {
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

					costByDate[date].prompt_tokens += promptTokens;
					costByDate[date].completion_tokens += completionTokens;
					costByDate[date].total_tokens += totalTokens;
					costByDate[date].input_cost += inputCost;
					costByDate[date].output_cost += outputCost;
					costByDate[date].total_cost += totalCost;
				}

				if (row.chat_session_id) {
					const sessionEntry = sessionStats.get(row.chat_session_id) || {
						tokens: 0,
						cost: 0
					};
					sessionEntry.tokens += totalTokens;
					sessionEntry.cost += totalCost;
					sessionStats.set(row.chat_session_id, sessionEntry);
				}

				if (row.user_id) {
					const userEntry = userStats.get(row.user_id) || {
						user_id: row.user_id,
						total_tokens: 0,
						total_cost: 0,
						session_ids: new Set<string>()
					};

					userEntry.total_tokens += totalTokens;
					userEntry.total_cost += totalCost;
					if (row.chat_session_id) {
						userEntry.session_ids.add(row.chat_session_id);
					}
					userStats.set(row.user_id, userEntry);
				}
			}

			const byModel = Array.from(modelStats.entries())
				.map(([model, stats]) => ({ model, tokens: stats.tokens, cost: stats.cost }))
				.sort((a, b) => b.cost - a.cost);

			const costTrends = Object.values(costByDate).sort((a: any, b: any) =>
				a.date.localeCompare(b.date)
			);

			const topSessionEntries = Array.from(sessionStats.entries())
				.sort((a, b) => b[1].cost - a[1].cost)
				.slice(0, 20);
			const topSessionIds = topSessionEntries.map(([sessionId]) => sessionId);
			const sessionsById = new Map<string, any>();

			if (topSessionIds.length > 0) {
				const { data: sessionsData, error: sessionsError } = await supabase
					.from('chat_sessions')
					.select(
						`
						id,
						title,
						auto_title,
						created_at,
						users!inner(email)
					`
					)
					.in('id', topSessionIds);

				if (sessionsError) throw sessionsError;

				(sessionsData || []).forEach((session) => sessionsById.set(session.id, session));
			}

			const topSessions = topSessionEntries.map(([sessionId, stats]) => {
				const session = sessionsById.get(sessionId);
				return {
					id: sessionId,
					title: session?.title || session?.auto_title || 'Untitled Session',
					user_email: session?.users?.email || 'Unknown',
					tokens: stats.tokens,
					cost: stats.cost,
					created_at: session?.created_at || null
				};
			});

			const topUserEntries = Array.from(userStats.values())
				.sort((a, b) => b.total_cost - a.total_cost)
				.slice(0, 10);
			const userIds = topUserEntries.map((user) => user.user_id);
			const userEmailMap = new Map<string, string>();

			if (userIds.length > 0) {
				const { data: usersData, error: usersError } = await supabase
					.from('users')
					.select('id, email')
					.in('id', userIds);

				if (usersError) throw usersError;

				(usersData || []).forEach((user) => {
					userEmailMap.set(user.id, user.email);
				});
			}

			const topUsers = topUserEntries.map((user) => ({
				user_id: user.user_id,
				email: userEmailMap.get(user.user_id) || 'Unknown',
				total_tokens: user.total_tokens,
				total_cost: user.total_cost,
				session_count: user.session_ids.size
			}));

			const inputCostPerM =
				totals.promptTokens > 0 ? (totals.inputCost / totals.promptTokens) * 1_000_000 : 0;
			const outputCostPerM =
				totals.completionTokens > 0
					? (totals.outputCost / totals.completionTokens) * 1_000_000
					: 0;
			const avgCostPerM =
				totals.totalTokens > 0 ? (totals.totalCost / totals.totalTokens) * 1_000_000 : 0;

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

			const avgCostPerToken =
				totals.totalTokens > 0
					? totals.totalCost / totals.totalTokens
					: PRICING.AVG_COST_PER_M / 1_000_000;
			const costSavedByCompression = tokensSaved * avgCostPerToken;

			return ApiResponse.success({
				overview: {
					total_tokens: totals.totalTokens,
					total_cost: totals.totalCost,
					chat_tokens: totals.chatTokens,
					chat_cost: totals.chatCost,
					agent_tokens: totals.agentTokens,
					agent_cost: totals.agentCost,
					prompt_tokens: totals.promptTokens,
					completion_tokens: totals.completionTokens,
					input_cost: totals.inputCost,
					output_cost: totals.outputCost
				},
				by_model: byModel,
				top_sessions: topSessions,
				top_users: topUsers,
				cost_trends: costTrends,
				compression_savings: {
					tokens_saved: tokensSaved,
					cost_saved: costSavedByCompression
				},
				pricing: {
					INPUT_COST_PER_M: inputCostPerM,
					OUTPUT_COST_PER_M: outputCostPerM,
					AVG_COST_PER_M: avgCostPerM
				}
			});
		}

		// ===================================================
		// Legacy fallback (no llm_usage_logs data)
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

		const { data: agentMessagesData, error: agentMessagesError } = await supabase
			.from('agent_chat_messages')
			.select('tokens_used, model_used, created_at')
			.gte('created_at', startDate.toISOString())
			.not('tokens_used', 'is', null);

		if (agentMessagesError) throw agentMessagesError;

		const totalAgentTokens =
			agentMessagesData?.reduce((sum, m) => sum + (m.tokens_used || 0), 0) || 0;

		const totalAgentCost = (totalAgentTokens / 1000000) * PRICING.AVG_COST_PER_M;

		const tokensByModel =
			agentMessagesData?.reduce(
				(acc, m) => {
					const model = m.model_used || 'unknown';
					acc[model] = (acc[model] || 0) + (m.tokens_used || 0);
					return acc;
				},
				{} as Record<string, number>
			) || {};

		const totalTokens = totalChatTokens + totalAgentTokens;
		const totalCost = totalChatCost + totalAgentCost;

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

		const { data: allSessionsData, error: allSessionsError } = await supabase
			.from('chat_sessions')
			.select('user_id, total_tokens_used, users!inner(email)')
			.gte('created_at', startDate.toISOString())
			.not('total_tokens_used', 'is', null);

		if (allSessionsError) throw allSessionsError;

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
