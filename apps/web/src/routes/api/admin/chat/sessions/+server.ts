// apps/web/src/routes/api/admin/chat/sessions/+server.ts
/**
 * Chat Sessions List API
 *
 * Returns paginated list of chat sessions with filters and timing metrics
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

interface TimingMetrics {
	ttfr_ms: number | null;
	ttfe_ms: number | null;
	context_build_ms: number | null;
	tool_selection_ms: number | null;
	clarification_ms: number | null;
	plan_creation_ms: number | null;
	plan_execution_ms: number | null;
	plan_step_count: number | null;
	plan_status: string | null;
}

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

	// Parse query parameters
	const timeframe = url.searchParams.get('timeframe') || '7d';
	const status = url.searchParams.get('status');
	const contextType = url.searchParams.get('context_type');
	const search = url.searchParams.get('search');
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '20');
	const sortBy = url.searchParams.get('sort_by') || 'created_at';
	const sortOrder = url.searchParams.get('sort_order') || 'desc';

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
		// Build query
		let query = supabase
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
        initial_context,
        user_id,
        plan_id,
        users!agent_chat_sessions_user_id_fkey(id, email, name)
      `,
				{ count: 'exact' }
			)
			.gte('created_at', startDate.toISOString())
			.order('created_at', { ascending: sortOrder === 'asc' });

		// Apply filters
		if (status) {
			query = query.eq('status', status);
		}

		if (contextType) {
			query = query.eq('context_type', contextType);
		}

		if (search) {
			// Search in user email or session ID
			query = query.or(`id.ilike.%${search}%,users.email.ilike.%${search}%`);
		}

		// Apply pagination
		const offset = (page - 1) * limit;
		query = query.range(offset, offset + limit - 1);

		const { data: sessionsData, error: sessionsError, count } = await query;

		if (sessionsError) throw sessionsError;

		// For each session, check for token usage, tool calls, errors, and timing metrics
		const sessionIds = sessionsData?.map((s) => s.id) || [];

		const usageBySession = new Map<string, { total_tokens: number; total_cost: number }>();
		const tokensBySession = new Map<string, number>();
		const toolCallsBySession = new Map<string, number>();
		const sessionsWithErrors = new Set<string>();
		const timingBySession = new Map<string, TimingMetrics>();

		if (sessionIds.length > 0) {
			const [
				{ data: usageLogs, error: usageError },
				{ data: messageStats, error: messageStatsError },
				{ data: executions, error: executionsError },
				{ data: timingMetrics, error: timingError }
			] = await Promise.all([
				supabase
					.from('llm_usage_logs')
					.select('agent_session_id, total_tokens, total_cost_usd')
					.in('agent_session_id', sessionIds),
				supabase
					.from('agent_chat_messages')
					.select('agent_session_id, tokens_used, tool_calls')
					.in('agent_session_id', sessionIds),
				supabase
					.from('agent_executions')
					.select('agent_session_id, success')
					.in('agent_session_id', sessionIds),
				supabase
					.from('timing_metrics')
					.select(
						`
						session_id,
						time_to_first_response_ms,
						time_to_first_event_ms,
						context_build_ms,
						tool_selection_ms,
						clarification_ms,
						plan_creation_ms,
						plan_execution_ms,
						plan_step_count,
						plan_status
					`
					)
					.in('session_id', sessionIds)
			]);

			if (usageError) throw usageError;
			if (messageStatsError) throw messageStatsError;
			if (executionsError) throw executionsError;
			if (timingError) throw timingError;

			(usageLogs || []).forEach((log) => {
				if (!log.agent_session_id) return;
				const current = usageBySession.get(log.agent_session_id) || {
					total_tokens: 0,
					total_cost: 0
				};
				current.total_tokens += log.total_tokens || 0;
				current.total_cost += Number(log.total_cost_usd || 0);
				usageBySession.set(log.agent_session_id, current);
			});

			(messageStats || []).forEach((msg) => {
				if (!msg.agent_session_id) return;
				const tokenSum =
					(tokensBySession.get(msg.agent_session_id) || 0) + (msg.tokens_used || 0);
				tokensBySession.set(msg.agent_session_id, tokenSum);

				if (msg.tool_calls) {
					const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls.length : 1;
					const current = toolCallsBySession.get(msg.agent_session_id) || 0;
					toolCallsBySession.set(msg.agent_session_id, current + toolCalls);
				}
			});

			(executions || []).forEach((execution) => {
				if (execution.success === false && execution.agent_session_id) {
					sessionsWithErrors.add(execution.agent_session_id);
				}
			});

			// Store timing metrics by session - use most recent if multiple
			(timingMetrics || []).forEach((timing) => {
				if (!timing.session_id) return;
				// Only set if not already present (first row is most recent due to order)
				if (!timingBySession.has(timing.session_id)) {
					timingBySession.set(timing.session_id, {
						ttfr_ms: timing.time_to_first_response_ms,
						ttfe_ms: timing.time_to_first_event_ms,
						context_build_ms: timing.context_build_ms,
						tool_selection_ms: timing.tool_selection_ms,
						clarification_ms: timing.clarification_ms,
						plan_creation_ms: timing.plan_creation_ms,
						plan_execution_ms: timing.plan_execution_ms,
						plan_step_count: timing.plan_step_count,
						plan_status: timing.plan_status
					});
				}
			});
		}

		// Format sessions
		const sessions = (sessionsData || []).map((session) => {
			const usageStats = usageBySession.get(session.id);
			const fallbackTokens = tokensBySession.get(session.id) ?? 0;
			const totalTokens = usageStats?.total_tokens ?? fallbackTokens;
			const costEstimate = usageStats?.total_cost ?? (totalTokens / 1000000) * 0.21; // $0.21 per 1M tokens fallback
			const context = session.initial_context as Record<string, any> | null;
			const title =
				context?.task?.title ||
				context?.task?.name ||
				context?.title ||
				context?.user_message ||
				(session.session_type === 'planner_thinking' ? 'Planner Session' : 'Agent Session');

			const timing = timingBySession.get(session.id);

			return {
				id: session.id,
				title,
				user: {
					id: session.users?.id,
					email: session.users?.email,
					name: session.users?.name
				},
				message_count: session.message_count || 0,
				total_tokens: totalTokens,
				tool_call_count: toolCallsBySession.get(session.id) || 0,
				context_type: session.context_type || session.session_type,
				status: session.status,
				created_at: session.created_at,
				updated_at: session.completed_at || session.created_at,
				has_agent_plan: !!session.plan_id,
				has_compression: false,
				has_errors: sessionsWithErrors.has(session.id) || session.status === 'failed',
				cost_estimate: costEstimate,
				// Timing metrics
				timing: timing || null
			};
		});

		// If sorting by timing field, sort in memory after fetching
		if (sortBy.startsWith('timing_')) {
			const timingField = sortBy.replace('timing_', '') as keyof TimingMetrics;
			sessions.sort((a, b) => {
				const aVal =
					a.timing?.[timingField] ?? (sortOrder === 'desc' ? -Infinity : Infinity);
				const bVal =
					b.timing?.[timingField] ?? (sortOrder === 'desc' ? -Infinity : Infinity);
				const aNum = typeof aVal === 'number' ? aVal : 0;
				const bNum = typeof bVal === 'number' ? bVal : 0;
				return sortOrder === 'desc' ? bNum - aNum : aNum - bNum;
			});
		}

		return ApiResponse.success({
			sessions,
			total: count || 0,
			page,
			limit,
			total_pages: Math.ceil((count || 0) / limit)
		});
	} catch (err) {
		console.error('Sessions list error:', err);
		return ApiResponse.internalError(err, 'Failed to load chat sessions');
	}
};
