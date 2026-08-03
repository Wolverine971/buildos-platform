-- supabase/migrations/20260802037000_agentic_chat_worker_reconciliation.sql
-- Agentic Chat Worker migration, Phase 2C Slice 5: generation-consistent,
-- ownership-scoped reconciliation.
--
-- This package adds one bounded service-only read transaction. It does not add
-- a browser channel, queue consumer, provider/model call, feature flag, or
-- enabled worker route.

CREATE OR REPLACE FUNCTION public.reconcile_agentic_chat_turn(
	p_turn_run_id uuid,
	p_user_id uuid,
	p_requested_execution_generation integer DEFAULT NULL,
	p_after_durable_sequence integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_message public.chat_messages%ROWTYPE;
	v_generation_changed boolean;
	v_effective_cursor integer;
	v_event_count integer;
	v_events jsonb;
	v_assistant_message jsonb;
	v_snapshot_sequence integer;
	v_durable_sequence integer;
	v_projection_sequence integer;
	v_assistant_text text;
	v_projection jsonb;
	v_reconcile_required boolean;
	v_snapshot_updated_at timestamptz;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_user_id IS NULL
		OR p_after_durable_sequence IS NULL
		OR p_after_durable_sequence < 0
		OR (
			p_requested_execution_generation IS NOT NULL
			AND p_requested_execution_generation < 0
		)
		OR (
			p_requested_execution_generation IS NULL
			AND p_after_durable_sequence <> 0
		) THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_invalid_cursor';
	END IF;

	-- Every supported claim/write/finalize primitive takes the turn lock first.
	-- If one is in flight this waits for its commit, then all reads below observe
	-- that committed generation while this shared lock blocks the next writer.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
		AND turns.user_id = p_user_id
	FOR SHARE;

	IF NOT FOUND THEN
		RETURN jsonb_build_object(
			'outcome', 'not_found',
			'turn_run_id', p_turn_run_id
		);
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime' THEN
		RETURN jsonb_build_object(
			'outcome', 'not_worker_turn',
			'turn_run_id', v_turn.id,
			'execution_mode', v_turn.execution_mode,
			'status', v_turn.status
		);
	END IF;
	IF v_turn.client_turn_id IS NULL
		OR btrim(v_turn.client_turn_id) = ''
		OR v_turn.stream_run_id IS NULL
		OR btrim(v_turn.stream_run_id) = ''
		OR v_turn.execution_generation < 0
		OR (v_turn.status <> 'queued' AND v_turn.execution_generation < 1) THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_turn_relationship_corrupt';
	END IF;

	SELECT streams.*
	INTO v_stream
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id;

	IF NOT FOUND THEN
		IF v_turn.status <> 'queued'
			OR v_turn.execution_generation <> 0
			OR v_turn.last_event_sequence <> 0 THEN
			RAISE EXCEPTION 'agentic_chat_reconcile_stream_state_missing';
		END IF;

		v_snapshot_sequence := 0;
		v_durable_sequence := 0;
		v_projection_sequence := 0;
		v_assistant_text := '';
		v_projection := '{}'::jsonb;
		v_reconcile_required := false;
		v_snapshot_updated_at := v_turn.updated_at;
	ELSE
		IF v_stream.session_id IS DISTINCT FROM v_turn.session_id
			OR v_stream.user_id IS DISTINCT FROM v_turn.user_id
			OR v_stream.execution_generation IS DISTINCT FROM v_turn.execution_generation
			OR v_stream.snapshot_sequence IS DISTINCT FROM v_turn.last_event_sequence
			OR v_stream.durable_through_sequence IS DISTINCT FROM v_turn.last_event_sequence
			OR v_stream.projection_durable_sequence > v_stream.durable_through_sequence THEN
			RAISE EXCEPTION 'agentic_chat_reconcile_stream_state_corrupt';
		END IF;

		v_snapshot_sequence := v_stream.snapshot_sequence;
		v_durable_sequence := v_stream.durable_through_sequence;
		v_projection_sequence := v_stream.projection_durable_sequence;
		v_assistant_text := v_stream.assistant_text;
		v_projection := v_stream.projection;
		v_reconcile_required := v_stream.reconcile_required;
		v_snapshot_updated_at := v_stream.updated_at;
	END IF;

	v_generation_changed := p_requested_execution_generation IS NOT NULL
		AND p_requested_execution_generation IS DISTINCT FROM v_turn.execution_generation;

	IF NOT v_generation_changed
		AND p_after_durable_sequence > v_durable_sequence THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_cursor_ahead';
	END IF;

	v_effective_cursor := CASE
		WHEN v_generation_changed THEN v_projection_sequence
		ELSE GREATEST(p_after_durable_sequence, v_projection_sequence)
	END;

	SELECT count(*)
	INTO v_event_count
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation
		AND events.sequence_index > v_effective_cursor
		AND events.sequence_index <= v_durable_sequence;

	IF v_event_count > 64 THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_event_window_exceeded';
	END IF;

	SELECT COALESCE(
		jsonb_agg(
			COALESCE(events.payload, '{}'::jsonb) || jsonb_build_object(
				'contract_version', 'agentic_chat_worker_v1',
				'event_id', events.event_id,
				'stream_run_id', events.stream_run_id,
				'client_turn_id', v_turn.client_turn_id,
				'session_id', events.session_id,
				'turn_run_id', events.turn_run_id,
				'execution_generation', events.execution_generation,
				'sequence_index', events.sequence_index,
				'phase', events.phase,
				'event_type', events.event_type,
				'durable', true
			)
			ORDER BY events.sequence_index
		),
		'[]'::jsonb
	)
	INTO v_events
	FROM public.chat_turn_events events
	WHERE events.turn_run_id = v_turn.id
		AND events.execution_generation = v_turn.execution_generation
		AND events.sequence_index > v_effective_cursor
		AND events.sequence_index <= v_durable_sequence;

	IF v_turn.assistant_message_id IS NOT NULL THEN
		SELECT messages.*
		INTO v_message
		FROM public.chat_messages messages
		WHERE messages.id = v_turn.assistant_message_id
			AND messages.session_id = v_turn.session_id
			AND messages.user_id = v_turn.user_id;

		IF NOT FOUND
			OR v_message.role <> 'assistant'
			OR v_message.metadata->>'turn_run_id' IS DISTINCT FROM v_turn.id::text
			OR (v_message.metadata->>'execution_generation')::integer
				IS DISTINCT FROM v_turn.execution_generation THEN
			RAISE EXCEPTION 'agentic_chat_reconcile_assistant_message_corrupt';
		END IF;

		v_assistant_message := jsonb_build_object(
			'id', v_message.id,
			'role', v_message.role,
			'content', v_message.content,
			'metadata', COALESCE(v_message.metadata, '{}'::jsonb),
			'prompt_tokens', v_message.prompt_tokens,
			'completion_tokens', v_message.completion_tokens,
			'total_tokens', v_message.total_tokens,
			'created_at', v_message.created_at
		);
	ELSE
		v_assistant_message := NULL;
	END IF;

	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		IF v_turn.terminal_event_id IS NULL
			OR v_turn.terminalized_at IS NULL
			OR v_turn.terminal_event_id IS DISTINCT FROM (
				v_turn.id::text
				|| ':' || v_turn.execution_generation::text
				|| ':' || v_turn.last_event_sequence::text
			)
			OR (v_turn.status = 'completed' AND v_turn.assistant_message_id IS NULL) THEN
			RAISE EXCEPTION 'agentic_chat_reconcile_terminal_receipt_corrupt';
		END IF;
	ELSIF v_turn.terminal_event_id IS NOT NULL
		OR v_turn.terminalized_at IS NOT NULL
		OR v_turn.assistant_message_id IS NOT NULL THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_nonterminal_receipt_corrupt';
	END IF;

	RETURN jsonb_build_object(
		'outcome', 'reconciled',
		'contract_version', 'agentic_chat_worker_v1',
		'turn_run_id', v_turn.id,
		'session_id', v_turn.session_id,
		'user_id', v_turn.user_id,
		'stream_run_id', v_turn.stream_run_id,
		'client_turn_id', v_turn.client_turn_id,
		'execution_mode', v_turn.execution_mode,
		'requested_execution_generation', p_requested_execution_generation,
		'execution_generation', v_turn.execution_generation,
		'generation_changed', v_generation_changed,
		'status', v_turn.status,
		'text', v_assistant_text,
		'projection', v_projection,
		'snapshot_sequence', v_snapshot_sequence,
		'durable_through_sequence', v_durable_sequence,
		'projection_durable_sequence', v_projection_sequence,
		'durable_events', v_events,
		'response_watermark', v_durable_sequence,
		'reconcile_required', v_reconcile_required,
		'assistant_message', v_assistant_message,
		'terminal_event_id', v_turn.terminal_event_id,
		'terminalized_at', v_turn.terminalized_at,
		'finished_reason', v_turn.finished_reason,
		'failure_code', v_turn.failure_code,
		'updated_at', v_snapshot_updated_at
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_agentic_chat_turn(uuid, uuid, integer, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_agentic_chat_turn(uuid, uuid, integer, integer)
	TO service_role;

COMMENT ON FUNCTION public.reconcile_agentic_chat_turn(uuid, uuid, integer, integer) IS
	'Service-only, ownership-scoped current-generation Agentic Chat snapshot. Locks the turn before reading complete stream projection, retained post-projection events, and terminal message.';
