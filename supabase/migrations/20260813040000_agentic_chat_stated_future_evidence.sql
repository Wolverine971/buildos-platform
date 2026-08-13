-- supabase/migrations/20260813040000_agentic_chat_stated_future_evidence.sql
-- Agentic Chat Worker, Phase 4 P4 S6: deterministic stated-future evidence.
--
-- The worker keeps the exact shared TypeScript eligibility predicate. This RPC
-- only generation-fences the read and projects the durable tool ledger into the
-- small subset of arguments/results that predicate consumes.

BEGIN;

CREATE OR REPLACE FUNCTION public.load_agentic_chat_stated_future_evidence(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_executions jsonb := '[]'::jsonb;
	v_outcome text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role', ''),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_stated_future_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_stated_future_invalid_identity';
	END IF;

	SELECT turns.* INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_stated_future_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR v_turn.execution_mode IS DISTINCT FROM 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_stated_future_scope_mismatch';
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled')
		OR v_turn.terminalized_at IS NOT NULL THEN
		v_outcome := 'already_terminal';
	ELSIF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		v_outcome := 'stale_generation';
	ELSIF v_turn.cancel_requested_at IS NOT NULL THEN
		v_outcome := 'cancel_requested';
	ELSE
		IF v_turn.status IS DISTINCT FROM 'running' OR v_turn.execution_started_at IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_stated_future_not_started';
		END IF;
		SELECT jobs.* INTO v_job
		FROM public.queue_jobs jobs
		WHERE jobs.id = p_queue_job_id
		FOR UPDATE;
		IF NOT FOUND OR v_job.user_id IS DISTINCT FROM v_turn.user_id
			OR v_job.job_type::text IS DISTINCT FROM 'agentic_chat_turn'
			OR v_job.status::text IS DISTINCT FROM 'processing'
			OR v_job.processing_token IS DISTINCT FROM p_processing_token
			OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
			OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
			RAISE EXCEPTION 'agentic_chat_stated_future_ownership_lost';
		END IF;

		SELECT COALESCE(jsonb_agg(projected.execution ORDER BY projected.ordinal), '[]'::jsonb)
		INTO v_executions
		FROM (
			SELECT
				row_number() OVER (
					ORDER BY executions.sequence_index NULLS LAST, executions.created_at, executions.id
				) AS ordinal,
				jsonb_build_object(
					'name', left(executions.tool_name, 256),
					'success', executions.success,
					'error', CASE WHEN executions.error_message LIKE
						'Tool validation failed: Duplicate commissioned target skipped:%'
						THEN left(executions.error_message, 1024) ELSE NULL END,
					'args', CASE WHEN btrim(executions.tool_name) = 'update_onto_document' THEN
						jsonb_strip_nulls(jsonb_build_object(
							'content', CASE WHEN jsonb_typeof(executions.arguments->'content') = 'string'
								THEN left(executions.arguments->>'content', 1024) ELSE NULL END,
							'body_markdown', CASE WHEN jsonb_typeof(executions.arguments->'body_markdown') = 'string'
								THEN left(executions.arguments->>'body_markdown', 1024) ELSE NULL END,
							'markdown', CASE WHEN jsonb_typeof(executions.arguments->'markdown') = 'string'
								THEN left(executions.arguments->>'markdown', 1024) ELSE NULL END,
							'body', CASE WHEN jsonb_typeof(executions.arguments->'body') = 'string'
								THEN left(executions.arguments->>'body', 1024) ELSE NULL END,
							'text', CASE WHEN jsonb_typeof(executions.arguments->'text') = 'string'
								THEN left(executions.arguments->>'text', 1024) ELSE NULL END,
							'document', CASE WHEN jsonb_typeof(executions.arguments->'document') = 'object' THEN
								jsonb_strip_nulls(jsonb_build_object(
									'content', CASE WHEN jsonb_typeof(executions.arguments#>'{document,content}') = 'string'
										THEN left(executions.arguments#>>'{document,content}', 1024) ELSE NULL END,
									'body_markdown', CASE WHEN jsonb_typeof(executions.arguments#>'{document,body_markdown}') = 'string'
										THEN left(executions.arguments#>>'{document,body_markdown}', 1024) ELSE NULL END,
									'markdown', CASE WHEN jsonb_typeof(executions.arguments#>'{document,markdown}') = 'string'
										THEN left(executions.arguments#>>'{document,markdown}', 1024) ELSE NULL END,
									'body', CASE WHEN jsonb_typeof(executions.arguments#>'{document,body}') = 'string'
										THEN left(executions.arguments#>>'{document,body}', 1024) ELSE NULL END,
									'text', CASE WHEN jsonb_typeof(executions.arguments#>'{document,text}') = 'string'
										THEN left(executions.arguments#>>'{document,text}', 1024) ELSE NULL END
								)) ELSE NULL END
						)) ELSE '{}'::jsonb END,
					'result', CASE WHEN executions.result IS NULL THEN NULL ELSE
						jsonb_strip_nulls(jsonb_build_object(
							'status', CASE WHEN jsonb_typeof(executions.result->'status') = 'string'
								THEN left(executions.result->>'status', 128) ELSE NULL END,
							'skipped_duplicate_write', CASE
								WHEN jsonb_typeof(executions.result->'skipped_duplicate_write') = 'boolean'
								THEN (executions.result->>'skipped_duplicate_write')::boolean ELSE NULL END,
							'result', CASE WHEN jsonb_typeof(executions.result->'result') = 'object' THEN
								jsonb_strip_nulls(jsonb_build_object(
									'status', CASE WHEN jsonb_typeof(executions.result#>'{result,status}') = 'string'
										THEN left(executions.result#>>'{result,status}', 128) ELSE NULL END,
									'skipped_duplicate_write', CASE
										WHEN jsonb_typeof(executions.result#>'{result,skipped_duplicate_write}') = 'boolean'
										THEN (executions.result#>>'{result,skipped_duplicate_write}')::boolean ELSE NULL END
								)) ELSE NULL END,
							'data', CASE WHEN jsonb_typeof(executions.result->'data') = 'object' THEN
								jsonb_strip_nulls(jsonb_build_object(
									'status', CASE WHEN jsonb_typeof(executions.result#>'{data,status}') = 'string'
										THEN left(executions.result#>>'{data,status}', 128) ELSE NULL END
								)) ELSE NULL END
						)) END
				) AS execution
			FROM public.chat_tool_executions executions
			WHERE executions.turn_run_id = v_turn.id
			ORDER BY executions.sequence_index NULLS LAST, executions.created_at, executions.id
			LIMIT 40
		) projected;
		v_outcome := 'eligible';
	END IF;

	RETURN jsonb_build_object(
		'outcome', v_outcome,
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'execution_generation', v_turn.execution_generation,
		'stream_run_id', v_turn.stream_run_id,
		'executions', v_executions
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.load_agentic_chat_stated_future_evidence(
	uuid, uuid, uuid, uuid, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_agentic_chat_stated_future_evidence(
	uuid, uuid, uuid, uuid, integer
) TO service_role;

COMMENT ON FUNCTION public.load_agentic_chat_stated_future_evidence(
	uuid, uuid, uuid, uuid, integer
) IS
	'P4 S6: service-only generation-fenced bounded durable tool evidence for deterministic stated-future capture.';

COMMIT;
