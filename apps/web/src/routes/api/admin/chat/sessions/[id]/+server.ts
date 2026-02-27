// apps/web/src/routes/api/admin/chat/sessions/[id]/+server.ts
/**
 * Chat Session Audit Detail API
 *
 * Returns full auditability payload for the current agentic chat stack:
 * - session metadata (`chat_sessions`)
 * - message timeline (`chat_messages`)
 * - tool calls/results (`chat_tool_executions`)
 * - LLM usage events (`llm_usage_logs`)
 * - optional operation/timing rows where present
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { buildSessionDetailPayload } from './session-detail-payload';

const isOptionalTableMissing = (error: unknown): boolean => {
	const maybe = error as { code?: string; message?: string } | null;
	if (!maybe) return false;
	if (maybe.code === '42P01') return true;
	return typeof maybe.message === 'string' && /does not exist/i.test(maybe.message);
};

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const sessionId = params.id;
	const { user } = await safeGetSession();

	if (!user?.id) {
		return ApiResponse.unauthorized();
	}

	const { data: adminUser, error: adminError } = await supabase
		.from('admin_users')
		.select('user_id')
		.eq('user_id', user.id)
		.single();

	if (adminError || !adminUser) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		const { data: sessionRow, error: sessionError } = await supabase
			.from('chat_sessions')
			.select(
				`
        id,
        user_id,
        title,
        auto_title,
        summary,
        status,
        context_type,
        entity_id,
        message_count,
        total_tokens_used,
        tool_call_count,
        created_at,
        updated_at,
        last_message_at,
        agent_metadata,
        users!chat_sessions_user_id_fkey(id, email, name)
      `
			)
			.eq('id', sessionId)
			.single();

		if (sessionError || !sessionRow) {
			return ApiResponse.notFound('Session not found');
		}

		const [
			{ data: messageRows, error: messageError },
			{ data: toolRows, error: toolError },
			{ data: usageRows, error: usageError },
			{ data: operationRows, error: operationError },
			{ data: timingData, error: timingError }
		] = await Promise.all([
			supabase
				.from('chat_messages')
				.select(
					`
          id,
          session_id,
          user_id,
          role,
          content,
          created_at,
          metadata,
          tool_call_id,
          tool_calls,
          tool_name,
          tool_result,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          message_type,
          error_message,
          error_code,
          operation_ids
        `
				)
				.eq('session_id', sessionId)
				.order('created_at', { ascending: true }),
			supabase
				.from('chat_tool_executions')
				.select(
					`
          id,
          session_id,
          message_id,
          tool_name,
          tool_category,
          arguments,
          result,
          execution_time_ms,
          tokens_consumed,
          success,
          error_message,
          requires_user_action,
          created_at
        `
				)
				.eq('session_id', sessionId)
				.order('created_at', { ascending: true }),
			supabase
				.from('llm_usage_logs')
				.select(
					`
          id,
          chat_session_id,
          operation_type,
          model_requested,
          model_used,
          provider,
          status,
          error_message,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          total_cost_usd,
          response_time_ms,
          request_started_at,
          request_completed_at,
          created_at,
          metadata,
          openrouter_request_id,
          openrouter_cache_status,
          streaming
        `
				)
				.eq('chat_session_id', sessionId)
				.order('created_at', { ascending: true }),
			supabase
				.from('chat_operations')
				.select(
					`
          id,
          chat_session_id,
          operation_type,
          table_name,
          status,
          reasoning,
          data,
          result,
          error_message,
          duration_ms,
          created_at,
          executed_at,
          sequence_number
        `
				)
				.eq('chat_session_id', sessionId)
				.order('created_at', { ascending: true }),
			supabase
				.from('timing_metrics')
				.select('*')
				.eq('session_id', sessionId)
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle()
		]);

		if (messageError) throw messageError;
		if (toolError) throw toolError;
		if (usageError) throw usageError;
		if (operationError && !isOptionalTableMissing(operationError)) throw operationError;
		if (timingError && !isOptionalTableMissing(timingError)) throw timingError;

		const payload = buildSessionDetailPayload({
			sessionRow,
			messages: messageRows ?? [],
			toolExecutions: toolRows ?? [],
			llmCalls: usageRows ?? [],
			operations: operationRows ?? [],
			timingData: timingData ?? null
		});

		return ApiResponse.success(payload);
	} catch (err) {
		console.error('Session detail error:', err);
		return ApiResponse.internalError(err, 'Failed to load session details');
	}
};
