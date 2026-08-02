-- supabase/migrations/20260802030500_agentic_chat_worker_terminal_control_rpcs.sql
-- Agentic Chat Worker migration, Phase 2B Slice 4B: atomic cancellation and
-- terminal compare-and-set finalization.
--
-- Both RPCs lock the domain turn first. The finalizer is the only worker-mode
-- terminal write boundary: it persists/resolves the outcome-appropriate
-- assistant message, complete terminal stream projection, deterministic done
-- event, and terminal turn state in one transaction. Broadcast is deliberately
-- outside this database boundary and must occur only after commit.
--
-- This package creates no queue consumer, provider/model call, event writer,
-- notification publisher, retry/recovery loop, or enabled worker route.

CREATE OR REPLACE FUNCTION public.finalize_agentic_chat_turn(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer,
	p_status text,
	p_finished_reason text,
	p_failure_code text,
	p_assistant_message_id uuid,
	p_assistant_text text,
	p_assistant_metadata jsonb,
	p_prompt_tokens integer,
	p_completion_tokens integer,
	p_total_tokens integer,
	p_projection jsonb,
	p_event_payload jsonb
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
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_message public.chat_messages%ROWTYPE;
	v_now timestamptz;
	v_should_persist_message boolean;
	v_message_id uuid;
	v_message_metadata jsonb;
	v_authoritative_message_metadata jsonb;
	v_projection jsonb;
	v_event_payload jsonb;
	v_terminal_sequence integer;
	v_terminal_event_id text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_finalize_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_identity';
	END IF;

	-- Turn is the first lock in every worker-owned control-plane primitive.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_finalize_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.execution_mode <> 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_finalize_turn_relationship_mismatch';
	END IF;

	-- A lost successful response resolves from immutable terminal truth before
	-- any stale ownership token or changed payload is considered.
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		IF v_turn.terminal_event_id IS NULL OR v_turn.terminalized_at IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_finalize_terminal_receipt_corrupt';
		END IF;
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'turn_run_id', v_turn.id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'finished_reason', v_turn.finished_reason,
			'failure_code', v_turn.failure_code,
			'assistant_message_id', v_turn.assistant_message_id,
			'terminal_event_id', v_turn.terminal_event_id,
			'terminal_sequence_index', v_turn.last_event_sequence,
			'terminalized_at', v_turn.terminalized_at
		);
	END IF;

	IF p_queue_job_id IS NULL
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id
		OR p_execution_generation IS NULL
		OR p_execution_generation < 0 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_ownership';
	END IF;

	IF v_turn.execution_generation IS DISTINCT FROM p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'stale_generation',
			'turn_run_id', v_turn.id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'queue_job_id', v_turn.queue_job_id,
			'requested_execution_generation', p_execution_generation,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status
		);
	END IF;

	IF p_status IS NULL
		OR p_status NOT IN ('completed', 'failed', 'cancelled') THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_terminal_status';
	END IF;
	IF p_finished_reason IS NULL OR btrim(p_finished_reason) = ''
		OR length(p_finished_reason) > 256
		OR (p_failure_code IS NOT NULL AND (
			btrim(p_failure_code) = '' OR length(p_failure_code) > 128
		)) THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_reason';
	END IF;
	IF p_status = 'completed' AND p_failure_code IS NOT NULL
		OR p_status = 'failed' AND p_failure_code IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_failure_code';
	END IF;

	IF v_turn.status = 'queued' THEN
		IF p_status <> 'cancelled' THEN
			RAISE EXCEPTION 'agentic_chat_finalize_invalid_predecessor';
		END IF;
	ELSIF v_turn.status = 'running' THEN
		IF v_turn.cancel_requested_at IS NOT NULL AND p_status <> 'cancelled' THEN
			RETURN jsonb_build_object(
				'outcome', 'cancel_requested',
				'turn_run_id', v_turn.id,
				'session_id', v_turn.session_id,
				'user_id', v_turn.user_id,
				'queue_job_id', v_turn.queue_job_id,
				'execution_generation', v_turn.execution_generation,
				'status', v_turn.status,
				'cancel_requested_at', v_turn.cancel_requested_at,
				'cancel_reason', v_turn.cancel_reason
			);
		END IF;
	ELSE
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_predecessor';
	END IF;
	IF p_status = 'cancelled' AND v_turn.cancel_requested_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_finalize_cancel_not_requested';
	END IF;

	IF p_assistant_text IS NULL
		OR octet_length(p_assistant_text) > 2097152 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_assistant_text';
	END IF;
	v_should_persist_message := p_status = 'completed' OR p_assistant_text <> '';
	IF v_should_persist_message AND p_assistant_message_id IS NULL
		OR NOT v_should_persist_message AND p_assistant_message_id IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_assistant_message';
	END IF;

	v_message_metadata := COALESCE(p_assistant_metadata, '{}'::jsonb);
	v_projection := COALESCE(p_projection, '{}'::jsonb);
	v_event_payload := COALESCE(p_event_payload, '{}'::jsonb);
	IF jsonb_typeof(v_message_metadata) <> 'object'
		OR jsonb_typeof(v_projection) <> 'object'
		OR jsonb_typeof(v_event_payload) <> 'object'
		OR pg_column_size(v_message_metadata) > 65536
		OR pg_column_size(v_projection) > 524288
		OR pg_column_size(v_event_payload) > 262144 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_json_payload';
	END IF;

	IF COALESCE(p_prompt_tokens, 0) < 0
		OR COALESCE(p_completion_tokens, 0) < 0
		OR COALESCE(p_total_tokens, 0) < 0
		OR (
			p_prompt_tokens IS NOT NULL
			AND p_completion_tokens IS NOT NULL
			AND p_total_tokens IS NOT NULL
			AND p_total_tokens::bigint
				<> p_prompt_tokens::bigint + p_completion_tokens::bigint
		)
		OR (
			NOT v_should_persist_message
			AND (
				p_prompt_tokens IS NOT NULL
				OR p_completion_tokens IS NOT NULL
				OR p_total_tokens IS NOT NULL
			)
		) THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_token_usage';
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_finalize_ownership_lost';
	END IF;

	IF v_turn.status = 'queued' THEN
		IF p_processing_token IS NOT NULL
			OR v_job.status::text NOT IN ('pending', 'retrying', 'processing') THEN
			RAISE EXCEPTION 'agentic_chat_finalize_ownership_lost';
		END IF;
	ELSE
		IF p_processing_token IS NULL
			OR v_job.status::text <> 'processing'
			OR v_job.processing_token IS DISTINCT FROM p_processing_token THEN
			RAISE EXCEPTION 'agentic_chat_finalize_ownership_lost';
		END IF;
	END IF;
	v_now := clock_timestamp();

	IF v_turn.last_event_sequence = 2147483647 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_sequence_exhausted';
	END IF;
	v_terminal_sequence := v_turn.last_event_sequence + 1;
	v_terminal_event_id := v_turn.id::text
		|| ':' || v_turn.execution_generation::text
		|| ':' || v_terminal_sequence::text;

	IF v_should_persist_message THEN
		v_authoritative_message_metadata := jsonb_build_object(
			'idempotency_key', 'chat-turn:' || v_turn.id::text || ':assistant',
			'turn_run_id', v_turn.id,
			'execution_generation', v_turn.execution_generation,
			'finished_reason', p_finished_reason,
			'terminal_status', p_status,
			'interrupted', p_status IN ('failed', 'cancelled'),
			'partial', p_status IN ('failed', 'cancelled')
		);
		v_message_metadata := v_message_metadata || v_authoritative_message_metadata;
		IF pg_column_size(v_message_metadata) > 65536 THEN
			RAISE EXCEPTION 'agentic_chat_finalize_invalid_json_payload';
		END IF;

		SELECT messages.*
		INTO v_message
		FROM public.chat_messages messages
		WHERE messages.session_id = v_turn.session_id
			AND messages.metadata->>'idempotency_key'
				= 'chat-turn:' || v_turn.id::text || ':assistant'
		LIMIT 1
		FOR UPDATE;

		IF NOT FOUND THEN
			INSERT INTO public.chat_messages (
					id,
					session_id,
					user_id,
					role,
					content,
					metadata,
					prompt_tokens,
					completion_tokens,
					total_tokens
				) VALUES (
					p_assistant_message_id,
					v_turn.session_id,
					v_turn.user_id,
					'assistant',
					p_assistant_text,
					v_message_metadata,
					p_prompt_tokens,
					p_completion_tokens,
					p_total_tokens
				)
				ON CONFLICT DO NOTHING
				RETURNING * INTO v_message;

			IF NOT FOUND THEN
				-- A concurrent writer may have won the idempotency or primary-key
				-- race after the first lookup. Resolve and validate the canonical
				-- idempotency row inside this same terminal transaction.
				SELECT messages.*
				INTO v_message
				FROM public.chat_messages messages
				WHERE messages.session_id = v_turn.session_id
					AND messages.metadata->>'idempotency_key'
						= 'chat-turn:' || v_turn.id::text || ':assistant'
				LIMIT 1
				FOR UPDATE;
			END IF;
		END IF;

		IF NOT FOUND
			OR v_message.user_id IS DISTINCT FROM v_turn.user_id
			OR v_message.role <> 'assistant'
			OR v_message.content IS DISTINCT FROM p_assistant_text
			OR v_message.prompt_tokens IS DISTINCT FROM p_prompt_tokens
			OR v_message.completion_tokens IS DISTINCT FROM p_completion_tokens
			OR v_message.total_tokens IS DISTINCT FROM p_total_tokens
			OR NOT COALESCE(v_message.metadata, '{}'::jsonb)
				@> v_authoritative_message_metadata THEN
			RAISE EXCEPTION 'agentic_chat_finalize_assistant_message_conflict';
		END IF;
		v_message_id := v_message.id;
	END IF;

	v_projection := v_projection || jsonb_build_object(
		'terminal', jsonb_build_object(
			'eventId', v_terminal_event_id,
			'sequenceIndex', v_terminal_sequence,
			'status', p_status,
			'finishedReason', p_finished_reason,
			'failureCode', p_failure_code,
			'assistantMessageId', v_message_id
		)
	);
	v_event_payload := v_event_payload || jsonb_build_object(
		'type', 'done',
		'status', p_status,
		'finished_reason', p_finished_reason,
		'failure_code', p_failure_code,
		'assistant_message_id', v_message_id
	);
	IF pg_column_size(v_projection) > 524288
		OR pg_column_size(v_event_payload) > 262144 THEN
		RAISE EXCEPTION 'agentic_chat_finalize_invalid_json_payload';
	END IF;

	SELECT streams.*
	INTO v_stream
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id
	FOR UPDATE;

	IF v_turn.status = 'running' AND (
		NOT FOUND
		OR v_stream.session_id IS DISTINCT FROM v_turn.session_id
		OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
		OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation
	) THEN
		RAISE EXCEPTION 'agentic_chat_finalize_current_generation_corrupt';
	END IF;

	INSERT INTO public.chat_turn_stream_state (
		turn_run_id,
		session_id,
		user_id,
		execution_generation,
		snapshot_sequence,
		durable_through_sequence,
		projection_durable_sequence,
		assistant_text,
		projection,
		reconcile_required,
		created_at,
		updated_at
	) VALUES (
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		v_turn.execution_generation,
		v_terminal_sequence,
		v_terminal_sequence,
		v_terminal_sequence,
		p_assistant_text,
		v_projection,
		true,
		v_now,
		v_now
	)
	ON CONFLICT (turn_run_id) DO UPDATE
	SET snapshot_sequence = EXCLUDED.snapshot_sequence,
		durable_through_sequence = EXCLUDED.durable_through_sequence,
		projection_durable_sequence = EXCLUDED.projection_durable_sequence,
		assistant_text = EXCLUDED.assistant_text,
		projection = EXCLUDED.projection,
		reconcile_required = true,
		updated_at = EXCLUDED.updated_at;

	INSERT INTO public.chat_turn_events (
		turn_run_id,
		session_id,
		user_id,
		stream_run_id,
		execution_generation,
		sequence_index,
		event_id,
		phase,
		event_type,
		payload,
		created_at
	) VALUES (
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		v_turn.stream_run_id,
		v_turn.execution_generation,
		v_terminal_sequence,
		v_terminal_event_id,
		'finalize',
		'done',
		v_event_payload,
		v_now
	);

	IF v_turn.status = 'queued' THEN
		UPDATE public.queue_jobs jobs
		SET status = 'cancelled',
			processing_token = NULL,
			completed_at = v_now,
			error_message = COALESCE(jobs.error_message, 'Agentic chat turn cancelled before claim'),
			updated_at = v_now
		WHERE jobs.id = v_job.id;
	END IF;

	UPDATE public.chat_turn_runs turns
	SET status = p_status,
		assistant_message_id = v_message_id,
		finished_reason = p_finished_reason,
		failure_code = p_failure_code,
		finished_at = v_now,
		terminal_event_id = v_terminal_event_id,
		terminalized_at = v_now,
		last_event_sequence = v_terminal_sequence,
		last_progress_at = v_now,
		updated_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = v_turn.status
		AND turns.execution_generation = v_turn.execution_generation;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_finalize_compare_and_set_lost';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'finalized',
		'turn_run_id', v_turn.id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'queue_job_id', v_turn.queue_job_id,
		'execution_generation', v_turn.execution_generation,
		'status', p_status,
		'finished_reason', p_finished_reason,
		'failure_code', p_failure_code,
		'assistant_message_id', v_message_id,
		'terminal_event_id', v_terminal_event_id,
		'terminal_sequence_index', v_terminal_sequence,
		'terminalized_at', v_now
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_agentic_chat_turn(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_agentic_chat_turn(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb
) TO service_role;

COMMENT ON FUNCTION public.finalize_agentic_chat_turn(
	uuid, uuid, uuid, uuid, integer, text, text, text, uuid, text, jsonb,
	integer, integer, integer, jsonb, jsonb
) IS
	'Service-only terminal compare-and-set. Atomically persists/resolves the terminal message, complete stream projection, deterministic done event, and immutable terminal turn receipt before Broadcast.';

CREATE OR REPLACE FUNCTION public.request_agentic_chat_turn_cancel(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_reason text,
	p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_signal public.chat_turn_signals%ROWTYPE;
	v_finalized jsonb;
	v_now timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_cancel_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_user_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_cancel_invalid_identity';
	END IF;
	IF p_reason IS NULL
		OR p_source IS NULL
		OR p_reason NOT IN (
		'user_cancelled', 'superseded', 'timeout', 'operator_cancelled'
	) OR p_source NOT IN ('browser', 'worker', 'operator', 'sweeper') THEN
		RAISE EXCEPTION 'agentic_chat_cancel_invalid_command';
	END IF;

	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_cancel_turn_not_found';
	END IF;
	IF v_turn.user_id IS DISTINCT FROM p_user_id
		OR v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_cancel_turn_relationship_mismatch';
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		IF v_turn.terminal_event_id IS NULL OR v_turn.terminalized_at IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_cancel_terminal_receipt_corrupt';
		END IF;
		RETURN jsonb_build_object(
			'outcome', 'already_terminal',
			'turn_run_id', v_turn.id,
			'session_id', v_turn.session_id,
			'user_id', v_turn.user_id,
			'queue_job_id', v_turn.queue_job_id,
			'execution_generation', v_turn.execution_generation,
			'status', v_turn.status,
			'finished_reason', v_turn.finished_reason,
			'failure_code', v_turn.failure_code,
			'assistant_message_id', v_turn.assistant_message_id,
			'terminal_event_id', v_turn.terminal_event_id,
			'terminal_sequence_index', v_turn.last_event_sequence,
			'terminalized_at', v_turn.terminalized_at
		);
	END IF;
	v_now := clock_timestamp();

	IF v_turn.status = 'queued' THEN
		UPDATE public.chat_turn_runs turns
		SET cancel_requested_at = COALESCE(turns.cancel_requested_at, v_now),
			cancel_reason = COALESCE(turns.cancel_reason, p_reason),
			updated_at = v_now
		WHERE turns.id = v_turn.id;

		v_finalized := public.finalize_agentic_chat_turn(
			v_turn.id,
			v_turn.user_id,
			v_turn.queue_job_id,
			NULL,
			v_turn.execution_generation,
			'cancelled',
			COALESCE(v_turn.cancel_reason, p_reason),
			NULL,
			NULL,
			'',
			'{}'::jsonb,
			NULL,
			NULL,
			NULL,
			'{}'::jsonb,
			jsonb_build_object(
				'cancel_reason', COALESCE(v_turn.cancel_reason, p_reason),
				'cancel_source', p_source
			)
		);

		RETURN v_finalized || jsonb_build_object('outcome', 'cancelled');
	END IF;

	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_cancel_invalid_status';
	END IF;

	IF v_turn.cancel_requested_at IS NULL THEN
		UPDATE public.chat_turn_runs turns
		SET cancel_requested_at = v_now,
			cancel_reason = p_reason,
			updated_at = v_now
		WHERE turns.id = v_turn.id
			AND turns.status = 'running'
			AND turns.execution_generation = v_turn.execution_generation
			AND turns.cancel_requested_at IS NULL;
		IF NOT FOUND THEN
			RAISE EXCEPTION 'agentic_chat_cancel_compare_and_set_lost';
		END IF;
	END IF;

	INSERT INTO public.chat_turn_signals (
		turn_run_id,
		session_id,
		user_id,
		reason,
		source,
		created_at
	) VALUES (
		v_turn.id,
		v_turn.session_id,
		v_turn.user_id,
		COALESCE(v_turn.cancel_reason, p_reason),
		p_source,
		COALESCE(v_turn.cancel_requested_at, v_now)
	)
	ON CONFLICT (turn_run_id) DO NOTHING;

	SELECT signals.*
	INTO v_signal
	FROM public.chat_turn_signals signals
	WHERE signals.turn_run_id = v_turn.id;

	IF NOT FOUND
		OR v_signal.reason IS DISTINCT FROM COALESCE(v_turn.cancel_reason, p_reason) THEN
		RAISE EXCEPTION 'agentic_chat_cancel_signal_corrupt';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'cancel_requested',
		'turn_run_id', v_turn.id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'queue_job_id', v_turn.queue_job_id,
		'execution_generation', v_turn.execution_generation,
		'status', 'running',
		'cancel_requested_at', v_signal.created_at,
		'cancel_reason', v_signal.reason,
		'cancel_source', v_signal.source,
		'signal_id', v_signal.id
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.request_agentic_chat_turn_cancel(uuid, uuid, text, text)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_agentic_chat_turn_cancel(uuid, uuid, text, text)
	TO service_role;

COMMENT ON FUNCTION public.request_agentic_chat_turn_cancel(uuid, uuid, text, text) IS
	'Service-only idempotent cancellation command. Queued turns and queue jobs become terminal atomically; running turns record one durable request and one append-only signal for the current worker.';
