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
import { loadPromptEvalResultsForTurnRuns } from '$lib/services/agentic-chat-v2/prompt-eval-runner';

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

	if (!user.is_admin) {
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
        extracted_entities,
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
			{ data: timingData, error: timingError },
			{ data: turnRunRows, error: turnRunError },
			{ data: promptSnapshotRows, error: promptSnapshotError },
			{ data: turnEventRows, error: turnEventError }
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
				.order('created_at', { ascending: true })
				.limit(1000),
			supabase
				.from('chat_tool_executions')
				.select(
					`
          id,
          session_id,
          message_id,
          turn_run_id,
          stream_run_id,
          client_turn_id,
          tool_name,
          tool_category,
          gateway_op,
          help_path,
          sequence_index,
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
				.order('created_at', { ascending: true })
				.limit(2000),
			supabase
				.from('llm_usage_logs')
				.select(
					`
          id,
          chat_session_id,
          turn_run_id,
          stream_run_id,
          client_turn_id,
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
          openrouter_usage_cost_usd,
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
				.order('created_at', { ascending: true })
				.limit(2000),
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
				.order('created_at', { ascending: true })
				.limit(1000),
			supabase
				.from('timing_metrics')
				.select('*')
				.eq('session_id', sessionId)
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle(),
			supabase
				.from('chat_turn_runs')
				.select(
					`
          id,
          stream_run_id,
          client_turn_id,
          source,
          context_type,
          entity_id,
          project_id,
          gateway_enabled,
          request_message,
          user_message_id,
          assistant_message_id,
          status,
          finished_reason,
          tool_round_count,
          tool_call_count,
          validation_failure_count,
          llm_pass_count,
          first_lane,
          first_help_path,
          first_skill_path,
          first_canonical_op,
          history_strategy,
          history_compressed,
          raw_history_count,
          history_for_model_count,
          cache_source,
          cache_age_seconds,
          request_prewarmed_context,
          prompt_snapshot_id,
          timing_metric_id,
          started_at,
          finished_at,
          created_at,
          updated_at
        `
				)
				.eq('session_id', sessionId)
				.order('started_at', { ascending: true })
				.limit(500),
			supabase
				.from('chat_prompt_snapshots')
				.select(
					`
          id,
          turn_run_id,
          snapshot_version,
          prompt_variant,
          system_prompt,
          model_messages,
          tool_definitions,
          request_payload,
          prompt_sections,
          context_payload,
          rendered_dump_text,
          system_prompt_sha256,
          messages_sha256,
          tools_sha256,
          system_prompt_chars,
          message_chars,
          approx_prompt_tokens,
          created_at
        `
				)
				.eq('session_id', sessionId)
				.order('created_at', { ascending: true })
				.limit(500),
			supabase
				.from('chat_turn_events')
				.select(
					`
          id,
          turn_run_id,
          stream_run_id,
          sequence_index,
          phase,
          event_type,
          payload,
          created_at
        `
				)
				.eq('session_id', sessionId)
				.order('created_at', { ascending: true })
				.limit(5000)
		]);

		if (messageError) throw messageError;
		if (toolError) throw toolError;
		if (usageError) throw usageError;
		if (operationError && !isOptionalTableMissing(operationError)) throw operationError;
		if (timingError && !isOptionalTableMissing(timingError)) throw timingError;
		if (turnRunError && !isOptionalTableMissing(turnRunError)) throw turnRunError;
		if (promptSnapshotError && !isOptionalTableMissing(promptSnapshotError))
			throw promptSnapshotError;
		if (turnEventError && !isOptionalTableMissing(turnEventError)) throw turnEventError;
		const turnRunIds = (turnRunRows ?? []).map((row) => row.id);
		const { evalRuns, assertions } = await loadPromptEvalResultsForTurnRuns(
			supabase,
			turnRunIds
		);

		const payload = buildSessionDetailPayload({
			sessionRow,
			messages: messageRows ?? [],
			toolExecutions: toolRows ?? [],
			llmCalls: usageRows ?? [],
			operations: operationRows ?? [],
			timingData: timingData ?? null,
			turnRuns: turnRunRows ?? [],
			promptSnapshots: promptSnapshotRows ?? [],
			turnEvents: turnEventRows ?? [],
			evalRuns,
			evalAssertions: assertions
		});

		return ApiResponse.success(payload);
	} catch (err) {
		console.error('Session detail error:', err);
		return ApiResponse.internalError(err, 'Failed to load session details');
	}
};
