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

		const { data: usageLogs, error: usageError } = await supabase
			.from('llm_usage_logs')
			.select(
				'user_id, agent_session_id, agent_plan_id, agent_execution_id, operation_type, model_used, prompt_tokens, completion_tokens, total_tokens, input_cost_usd, output_cost_usd, total_cost_usd, created_at'
			)
			.gte('created_at', startDate.toISOString())
			.lte('created_at', now.toISOString())
			.or(agentUsageFilter);

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

				totals.agentTokens += totalTokens;
				totals.agentCost += totalCost;

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

				if (row.agent_session_id) {
					const sessionEntry = sessionStats.get(row.agent_session_id) || {
						tokens: 0,
						cost: 0
					};
					sessionEntry.tokens += totalTokens;
					sessionEntry.cost += totalCost;
					sessionStats.set(row.agent_session_id, sessionEntry);
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
					if (row.agent_session_id) {
						userEntry.session_ids.add(row.agent_session_id);
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
					.from('agent_chat_sessions')
					.select(
						`
						id,
						created_at,
						session_type,
						initial_context,
						users!agent_chat_sessions_user_id_fkey(email)
					`
					)
					.in('id', topSessionIds);

				if (sessionsError) throw sessionsError;

				(sessionsData || []).forEach((session) => sessionsById.set(session.id, session));
			}

			const topSessions = topSessionEntries.map(([sessionId, stats]) => {
				const session = sessionsById.get(sessionId);
				const context = session?.initial_context as Record<string, any> | null;
				const title =
					context?.task?.title ||
					context?.task?.name ||
					context?.title ||
					context?.user_message ||
					(session?.session_type === 'planner_thinking'
						? 'Planner Session'
						: 'Agent Session');
				return {
					id: sessionId,
					title: title || 'Agent Session',
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

			const tokensSaved = 0;
			const costSavedByCompression = 0;

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
		const { data: agentMessagesData, error: agentMessagesError } = await supabase
			.from('agent_chat_messages')
			.select('agent_session_id, user_id, tokens_used, model_used, created_at')
			.gte('created_at', startDate.toISOString());

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

		const totalTokens = totalAgentTokens;
		const totalCost = totalAgentCost;

		const sessionStats = new Map<string, { tokens: number }>();
		const userStats = new Map<
			string,
			{
				user_id: string;
				total_tokens: number;
				total_cost: number;
				session_ids: Set<string>;
			}
		>();

		(agentMessagesData || []).forEach((msg) => {
			const tokens = msg.tokens_used || 0;
			if (msg.agent_session_id) {
				const current = sessionStats.get(msg.agent_session_id) || { tokens: 0 };
				current.tokens += tokens;
				sessionStats.set(msg.agent_session_id, current);
			}

			if (msg.user_id) {
				const current = userStats.get(msg.user_id) || {
					user_id: msg.user_id,
					total_tokens: 0,
					total_cost: 0,
					session_ids: new Set<string>()
				};
				current.total_tokens += tokens;
				current.total_cost += (tokens / 1000000) * PRICING.AVG_COST_PER_M;
				if (msg.agent_session_id) {
					current.session_ids.add(msg.agent_session_id);
				}
				userStats.set(msg.user_id, current);
			}
		});

		const topSessionEntries = Array.from(sessionStats.entries())
			.sort((a, b) => b[1].tokens - a[1].tokens)
			.slice(0, 20);
		const topSessionIds = topSessionEntries.map(([sessionId]) => sessionId);
		const sessionsById = new Map<string, any>();

		if (topSessionIds.length > 0) {
			const { data: sessionsData, error: sessionsError } = await supabase
				.from('agent_chat_sessions')
				.select(
					`
					id,
					created_at,
					session_type,
					initial_context,
					users!agent_chat_sessions_user_id_fkey(email)
				`
				)
				.in('id', topSessionIds);

			if (sessionsError) throw sessionsError;

			(sessionsData || []).forEach((session) => sessionsById.set(session.id, session));
		}

		const topSessions = topSessionEntries.map(([sessionId, stats]) => {
			const session = sessionsById.get(sessionId);
			const context = session?.initial_context as Record<string, any> | null;
			const title =
				context?.task?.title ||
				context?.task?.name ||
				context?.title ||
				context?.user_message ||
				(session?.session_type === 'planner_thinking'
					? 'Planner Session'
					: 'Agent Session');
			const costEstimate = (stats.tokens / 1000000) * PRICING.AVG_COST_PER_M;
			return {
				id: sessionId,
				title: title || 'Agent Session',
				user_email: session?.users?.email || 'Unknown',
				tokens: stats.tokens,
				cost: costEstimate,
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

		const costByDate = (agentMessagesData || []).reduce(
			(acc, msg) => {
				const date = msg.created_at.split('T')[0];
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

				const tokens = msg.tokens_used || 0;
				const cost = (tokens / 1000000) * PRICING.AVG_COST_PER_M;
				acc[date].total_tokens += tokens;
				acc[date].total_cost += cost;

				return acc;
			},
			{} as Record<string, any>
		);

		const costTrends = Object.values(costByDate).sort((a: any, b: any) =>
			a.date.localeCompare(b.date)
		);

		const tokensSaved = 0;
		const costSavedByCompression = 0;

		return ApiResponse.success({
			overview: {
				total_tokens: totalTokens,
				total_cost: totalCost,
				chat_tokens: 0,
				chat_cost: 0,
				agent_tokens: totalAgentTokens,
				agent_cost: totalAgentCost,
				prompt_tokens: 0,
				completion_tokens: 0,
				input_cost: 0,
				output_cost: 0
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
