// apps/web/src/routes/api/admin/chat/sessions/[id]/+server.ts
/**
 * Chat Session Detail API
 *
 * Returns complete session details including:
 * - Session metadata
 * - Conversation messages
 * - Agent plans and executions
 * - Agent-to-agent conversations
 * - Tool executions
 * - Compressions
 * - Timing metrics with timeline
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

interface TimingTimeline {
	message_received_at: string | null;
	first_event_at: string | null;
	first_response_at: string | null;
	plan_created_at: string | null;
	plan_execution_started_at: string | null;
	plan_completed_at: string | null;
}

interface TimingBreakdown {
	ttfr_ms: number | null;
	ttfe_ms: number | null;
	context_build_ms: number | null;
	tool_selection_ms: number | null;
	clarification_ms: number | null;
	plan_creation_ms: number | null;
	plan_execution_ms: number | null;
	plan_step_count: number | null;
	plan_status: string | null;
	// Derived metrics
	planning_overhead_ms: number | null;
	plan_latency_share: number | null;
}

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const sessionId = params.id;

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

	try {
		// ===================================================
		// 1. FETCH AGENT SESSION DATA
		// ===================================================
		const { data: session, error: sessionError } = await supabase
			.from('agent_chat_sessions')
			.select(
				`
        id,
        status,
        created_at,
        completed_at,
        message_count,
        session_type,
        context_type,
        entity_id,
        initial_context,
        user_id,
        plan_id,
        users!agent_chat_sessions_user_id_fkey(id, email, name)
      `
			)
			.eq('id', sessionId)
			.single();

		if (sessionError || !session) {
			return ApiResponse.notFound('Session not found');
		}

		// ===================================================
		// 2. FETCH SESSION MESSAGES
		// ===================================================
		const { data: messages, error: messagesError } = await supabase
			.from('agent_chat_messages')
			.select('id, role, content, created_at, tokens_used, tool_calls')
			.eq('agent_session_id', sessionId)
			.order('created_at', { ascending: true });

		if (messagesError) throw messagesError;

		const formattedMessages =
			messages?.map((message) => ({
				...message,
				total_tokens: message.tokens_used || 0
			})) || [];

		// ===================================================
		// 3. FETCH AGENT PLAN (if exists)
		// ===================================================
		const { data: agentPlan, error: planError } = session.plan_id
			? await supabase.from('agent_plans').select('*').eq('id', session.plan_id).single()
			: { data: null, error: null };

		if (planError) throw planError;

		// ===================================================
		// 4. FETCH AGENT EXECUTIONS (per session)
		// ===================================================
		const { data: executions, error: executionsError } = await supabase
			.from('agent_executions')
			.select('*')
			.eq('agent_session_id', sessionId)
			.order('created_at', { ascending: true });

		if (executionsError) throw executionsError;

		const agentExecutions =
			(executions || []).map((execution) => ({
				...execution,
				messages: formattedMessages
			})) || [];

		// ===================================================
		// 5. TOKEN USAGE + COSTS
		// ===================================================
		let totalTokens = formattedMessages.reduce(
			(sum, message) => sum + (message.total_tokens || 0),
			0
		);
		let costEstimate = (totalTokens / 1000000) * 0.21;

		const { data: usageLogs, error: usageError } = await supabase
			.from('llm_usage_logs')
			.select('total_tokens, total_cost_usd')
			.eq('agent_session_id', sessionId);

		if (usageError) throw usageError;

		if (usageLogs && usageLogs.length > 0) {
			const usageTotals = usageLogs.reduce(
				(acc, row) => {
					acc.total_tokens += row.total_tokens || 0;
					acc.total_cost += Number(row.total_cost_usd || 0);
					return acc;
				},
				{ total_tokens: 0, total_cost: 0 }
			);

			totalTokens = usageTotals.total_tokens;
			costEstimate = usageTotals.total_cost;
		}

		// ===================================================
		// 6. TIMING METRICS
		// ===================================================
		const { data: timingData, error: timingError } = await supabase
			.from('timing_metrics')
			.select('*')
			.eq('session_id', sessionId)
			.order('created_at', { ascending: false })
			.limit(1)
			.maybeSingle();

		if (timingError) throw timingError;

		let timingMetrics: {
			timeline: TimingTimeline;
			breakdown: TimingBreakdown;
		} | null = null;

		if (timingData) {
			// Calculate derived metrics
			const planningOverhead =
				(timingData.context_build_ms || 0) +
				(timingData.tool_selection_ms || 0) +
				(timingData.clarification_ms || 0);

			const planLatencyShare =
				timingData.plan_execution_ms && timingData.time_to_first_response_ms
					? (timingData.plan_execution_ms / timingData.time_to_first_response_ms) * 100
					: null;

			timingMetrics = {
				timeline: {
					message_received_at: timingData.message_received_at,
					first_event_at: timingData.first_event_at,
					first_response_at: timingData.first_response_at,
					plan_created_at: timingData.plan_created_at,
					plan_execution_started_at: timingData.plan_execution_started_at,
					plan_completed_at: timingData.plan_completed_at
				},
				breakdown: {
					ttfr_ms: timingData.time_to_first_response_ms,
					ttfe_ms: timingData.time_to_first_event_ms,
					context_build_ms: timingData.context_build_ms,
					tool_selection_ms: timingData.tool_selection_ms,
					clarification_ms: timingData.clarification_ms,
					plan_creation_ms: timingData.plan_creation_ms,
					plan_execution_ms: timingData.plan_execution_ms,
					plan_step_count: timingData.plan_step_count,
					plan_status: timingData.plan_status,
					planning_overhead_ms: planningOverhead > 0 ? planningOverhead : null,
					plan_latency_share: planLatencyShare
				}
			};
		}

		const context = session.initial_context as Record<string, any> | null;
		const title =
			context?.task?.title ||
			context?.task?.name ||
			context?.title ||
			context?.user_message ||
			(session.session_type === 'planner_thinking' ? 'Planner Session' : 'Agent Session');

		const toolCallCount = formattedMessages.reduce((count, message) => {
			if (!message.tool_calls) return count;
			const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.length : 1;
			return count + toolCalls;
		}, 0);

		return ApiResponse.success({
			session: {
				id: session.id,
				title,
				user: {
					id: session.users?.id,
					email: session.users?.email,
					name: session.users?.name
				},
				context_type: session.context_type || session.session_type,
				context_id: session.entity_id || null,
				status: session.status,
				message_count: session.message_count || formattedMessages.length,
				total_tokens: totalTokens,
				tool_call_count: toolCallCount,
				created_at: session.created_at,
				updated_at: session.completed_at || session.created_at,
				cost_estimate: costEstimate
			},
			messages: formattedMessages,
			agent_plan: agentPlan
				? {
						id: agentPlan.id,
						strategy: agentPlan.strategy,
						steps: agentPlan.steps,
						status: agentPlan.status,
						created_at: agentPlan.created_at,
						updated_at: agentPlan.updated_at
					}
				: null,
			agent_executions: agentExecutions,
			tool_executions: [],
			compressions: [],
			timing_metrics: timingMetrics
		});
	} catch (err) {
		console.error('Session detail error:', err);
		return ApiResponse.internalError(err, 'Failed to load session details');
	}
};
