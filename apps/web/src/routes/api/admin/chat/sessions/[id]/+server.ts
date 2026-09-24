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
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { buildSessionDetailPayload } from './session-detail-payload';
import { TURN_RUN_COLUMNS } from './turn-run-columns';
import { loadPromptEvalResultsForTurnRuns } from '$lib/services/agentic-chat-v2/prompt-eval-runner';
import {
	buildChatWorkflowAuditPayload,
	emptyWorkflowTableCoverage
} from '$lib/services/admin/chat-workflow-audit-build';
import { isOptionalTableMissing, loadWorkflowAuditRows } from './workflow-audit-loader';
import {
	assertAdminChatPassThroughContentProjected,
	logAdminChatContentAccess,
	projectAdminChatMessageRows,
	projectAdminToolExecutionRows,
	projectAdminTurnEventRows
} from '$lib/server/admin-chat-content-access';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Turn list page size. A deep-linked turn past this page is resolved by id below.
const TURN_RUN_PAGE_SIZE = 500;

/** Audit payloads are private records; never let a shared cache hold one. */
const privateNoStore = (response: Response): Response => {
	response.headers.set('Cache-Control', 'private, no-store');
	response.headers.set('Pragma', 'no-cache');
	return response;
};

export const GET: RequestHandler = async ({ params, url, request, locals: { safeGetSession } }) => {
	const sessionId = params.id;
	const { user } = await safeGetSession();

	if (!user?.id) {
		return privateNoStore(ApiResponse.unauthorized());
	}

	if (!user.is_admin) {
		return privateNoStore(ApiResponse.forbidden('Admin access required'));
	}

	// Optional deep-link target. It only narrows the caller's view; the payload is still the
	// whole session, and the id must belong to this session or the request is rejected.
	const requestedTurnRunId = url.searchParams.get('turn_run_id')?.trim() || null;
	if (requestedTurnRunId && !UUID_PATTERN.test(requestedTurnRunId)) {
		return privateNoStore(ApiResponse.badRequest('turn_run_id must be a UUID'));
	}

	try {
		const adminSupabase = createAdminSupabaseClient();

		const { data: sessionRow, error: sessionError } = await adminSupabase
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
			return privateNoStore(ApiResponse.notFound('Session not found'));
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
			adminSupabase
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
			adminSupabase
				.from('chat_tool_executions')
				.select(
					`
          id,
          session_id,
          message_id,
          turn_run_id,
          stream_run_id,
          client_turn_id,
          provider_tool_call_id,
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
			adminSupabase
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
			adminSupabase
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
			adminSupabase
				.from('timing_metrics')
				.select('*')
				.eq('session_id', sessionId)
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle(),
			adminSupabase
				.from('chat_turn_runs')
				.select(TURN_RUN_COLUMNS)
				.eq('session_id', sessionId)
				.order('started_at', { ascending: true })
				.limit(TURN_RUN_PAGE_SIZE),
			adminSupabase
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
			adminSupabase
				.from('chat_turn_events')
				.select(
					`
          id,
          turn_run_id,
          stream_run_id,
          sequence_index,
          phase,
          event_type,
          execution_generation,
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
		const turnRuns = [...(turnRunRows ?? [])];
		if (requestedTurnRunId && !turnRuns.some((row) => row.id === requestedTurnRunId)) {
			// The turn list is paged; a later turn is still this session's. Resolve it by id
			// (scoped to the session) before deciding it does not belong here.
			const { data: requestedTurnRun, error: requestedTurnRunError } = await adminSupabase
				.from('chat_turn_runs')
				.select(TURN_RUN_COLUMNS)
				.eq('id', requestedTurnRunId)
				.eq('session_id', sessionId)
				.maybeSingle();
			if (requestedTurnRunError && !isOptionalTableMissing(requestedTurnRunError)) {
				throw requestedTurnRunError;
			}
			if (!requestedTurnRun) {
				return privateNoStore(ApiResponse.notFound('Turn run not found in this session'));
			}
			turnRuns.push(requestedTurnRun);
		}
		const turnRunIds = turnRuns.map((row) => row.id);
		const capturedAt = new Date().toISOString();
		const [{ evalRuns, assertions }, workflowRows] = await Promise.all([
			loadPromptEvalResultsForTurnRuns(adminSupabase, turnRunIds),
			// The workflow join is additive. If it fails for a reason other than a missing
			// table, the ordinary audit must still load; the failure becomes coverage.
			loadWorkflowAuditRows({
				client: adminSupabase as unknown as Parameters<
					typeof loadWorkflowAuditRows
				>[0]['client'],
				sessionId,
				turnRunIds
			}).catch((workflowError: unknown) => {
				console.error('Workflow audit load error:', workflowError);
				const detail =
					workflowError instanceof Error
						? workflowError.message
						: 'Workflow records could not be loaded';
				return {
					runs: [],
					steps: [],
					dispatches: [],
					snapshots: [],
					readBatches: [],
					shadows: [],
					inputArtifacts: [],
					tables: emptyWorkflowTableCoverage('unavailable', detail)
				};
			})
		]);

		// Rows written before the worker's storage projection still hold Gmail,
		// Google Calendar, and web content; admins see the same trace as new rows.
		const messages = projectAdminChatMessageRows(messageRows ?? []);
		const toolExecutions = projectAdminToolExecutionRows(toolRows ?? []);
		const turnEvents = projectAdminTurnEventRows(turnEventRows ?? []);
		assertAdminChatPassThroughContentProjected({ toolExecutions, turnEvents });
		const payload = buildSessionDetailPayload({
			sessionRow,
			messages,
			toolExecutions,
			llmCalls: usageRows ?? [],
			operations: operationRows ?? [],
			timingData: timingData ?? null,
			turnRuns,
			promptSnapshots: promptSnapshotRows ?? [],
			turnEvents,
			evalRuns,
			evalAssertions: assertions
		});
		payload.workflows = buildChatWorkflowAuditPayload({
			rows: workflowRows,
			turnRuns: payload.turn_runs,
			llmCalls: payload.llm_calls,
			capturedAt
		});

		await logAdminChatContentAccess({
			adminUserId: user.id,
			action: 'read',
			route: '/api/admin/chat/sessions/[id]',
			targetType: 'chat_session',
			targetId: sessionId,
			targetUserIds: [sessionRow.user_id],
			rowCounts: {
				messages: messages.length,
				tool_executions: toolExecutions.length,
				turn_events: turnEvents.length,
				turn_runs: turnRuns.length,
				snapshots: promptSnapshotRows?.length ?? 0,
				llm_calls: usageRows?.length ?? 0
			},
			request
		});

		return privateNoStore(ApiResponse.success(payload));
	} catch (err) {
		console.error('Session detail error:', err);
		return privateNoStore(ApiResponse.internalError(err, 'Failed to load session details'));
	}
};
