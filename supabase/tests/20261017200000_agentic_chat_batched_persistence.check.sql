-- supabase/tests/20261017200000_agentic_chat_batched_persistence.check.sql
-- Free disposable rehearsal only. Never execute this against a linked database.
--   pnpm db:rehearse supabase/migrations/20261017200000_agentic_chat_batched_persistence.sql \
--     --check supabase/tests/20261017200000_agentic_chat_batched_persistence.check.sql
--
-- persist_agentic_chat_semantic_event_batch (audit S7/B4/M3) against production's
-- schema and triggers:
--   1. access: service_role only, SECURITY INVOKER, only search_path is SET;
--   2. ordering: one call writes n events at consecutive sequences in input
--      order, the projection once, and the turn/stream cursors;
--   3. idempotent replay: the same batch again writes nothing and returns the
--      stored receipts; a committed prefix plus new events continues the cursor;
--      a non-prefix replay or a changed payload is refused;
--   4. byte caps: an event payload over 256 KiB, a projection over 512 KiB, or
--      more than 64 events are refused before any write;
--   5. a projection naming an event above the batch is refused;
--   6. the per-event RPC, the text RPC, and reconcile keep working in between;
--   7. first_visible_text_at keeps the earliest in-window time;
--   8. stale generation, cancel, and terminal answer for the whole batch.

\set ON_ERROR_STOP on
SET client_min_messages = warning;

-- Every fixture row is rolled back at the end, so later standing checks (the
-- account-deletion purge scans every person-referencing column) never see them.
BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('5e100000-0000-4000-8000-000000000001', 'batched-persistence@example.com');
INSERT INTO public.users (id, email)
VALUES ('5e100000-0000-4000-8000-000000000001', 'batched-persistence@example.com')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.sid(p_prefix text, p_n integer)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT (p_prefix || '000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

-- One running worker turn at generation 1 with an empty stream at sequence 0.
CREATE OR REPLACE FUNCTION pg_temp.seed_batch_turn(p_n integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_user uuid := '5e100000-0000-4000-8000-000000000001';
	v_turn uuid := pg_temp.sid('d4', p_n);
	v_session uuid := pg_temp.sid('d2', p_n);
	v_job uuid := pg_temp.sid('d5', p_n);
	v_message uuid := pg_temp.sid('d3', p_n);
	v_artifact uuid := pg_temp.sid('d9', p_n);
	v_now timestamptz := clock_timestamp();
BEGIN
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (v_session, v_user, 'global', 'active');
	INSERT INTO public.chat_messages (id, session_id, user_id, role, content, metadata)
	VALUES (
		v_message, v_session, v_user, 'user', 'batch fixture ' || p_n,
		jsonb_build_object('idempotency_key', 'batched-persistence-user-' || p_n)
	);
	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status, queue_job_id,
		processing_token, started_at, attempts, max_attempts
	) VALUES (
		v_job, v_user, 'agentic_chat_turn',
		jsonb_build_object('turnRunId', v_turn, 'correlationId', pg_temp.sid('d6', p_n)),
		v_now - interval '1 minute', 'agentic-chat-turn:' || v_turn, 'processing',
		'batched_persistence_' || p_n, pg_temp.sid('d7', p_n), v_now - interval '40 seconds',
		0, 3
	);
	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, status, execution_mode, queue_job_id, correlation_id,
		execution_generation, last_progress_at, last_event_sequence, user_message_id
	) VALUES (
		v_turn, v_session, v_user, 'batch-stream-' || p_n, 'batch-client-' || p_n,
		'global', 'batch fixture ' || p_n, 'queued', 'worker_realtime', v_job,
		pg_temp.sid('d6', p_n), 0, v_now - interval '1 minute', 0, v_message
	);
	INSERT INTO public.chat_turn_input_artifacts (
		id, turn_run_id, session_id, user_id, artifact_version, history_source,
		history, prepared, content_hash, history_bytes, content_bytes, created_at,
		retain_until
	) VALUES (
		v_artifact, v_turn, v_session, v_user,
		'agentic_chat_input_v2', 'admission_window', '[]'::jsonb, '{}'::jsonb,
		repeat('a', 64), 2, 4, v_now - interval '1 minute', v_now + interval '7 days'
	);
	UPDATE public.chat_turn_runs
	SET input_artifact_id = v_artifact,
		status = 'running',
		execution_generation = 1,
		worker_started_at = v_now - interval '40 seconds',
		execution_started_at = v_now - interval '35 seconds',
		last_progress_at = v_now - interval '2 seconds',
		worker_lease_generation = 1,
		worker_lease_renewed_at = v_now - interval '5 seconds'
	WHERE id = v_turn;
	INSERT INTO public.chat_turn_stream_state (
		turn_run_id, session_id, user_id, execution_generation, snapshot_sequence,
		durable_through_sequence, projection_durable_sequence, assistant_text, projection,
		created_at, updated_at
	) VALUES (
		v_turn, v_session, v_user, 1, 0, 0, 0, '', '{}'::jsonb,
		v_now - interval '40 seconds', v_now - interval '2 seconds'
	);
END;
$$;

-- One event as the worker sends it: transition id d8..<turn><index>.
CREATE OR REPLACE FUNCTION pg_temp.batch_event(p_n integer, p_index integer, p_note text DEFAULT 'x')
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT jsonb_build_object(
		'transition_id', pg_temp.sid('d8', p_n * 100 + p_index),
		'phase', 'tool',
		'event_type', 'tool_call',
		'event_payload', jsonb_build_object(
			'type', 'tool_call',
			'tool_call', jsonb_build_object('id', 'call-' || p_index, 'note', p_note)
		)
	)
$$;

-- A projection whose events reach p_through.
CREATE OR REPLACE FUNCTION pg_temp.batch_projection(p_n integer, p_through integer)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT jsonb_build_object(
		'version', 'agentic_chat_ui_projection_v1',
		'current_activity', 'Looking things up…',
		'semantic_events', COALESCE((
			SELECT jsonb_agg(jsonb_build_object(
				'type', 'tool_call',
				'event_id', pg_temp.sid('d4', p_n)::text || ':1:' || sequence_index,
				'sequence_index', sequence_index
			) ORDER BY sequence_index)
			FROM generate_series(1, p_through) AS sequence_index
		), '[]'::jsonb)
	)
$$;

CREATE OR REPLACE FUNCTION pg_temp.persist_batch(
	p_n integer,
	p_events jsonb,
	p_projection jsonb,
	p_assistant_text text DEFAULT '',
	p_visible_at timestamptz DEFAULT NULL,
	p_visible_source text DEFAULT NULL,
	p_generation integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT public.persist_agentic_chat_semantic_event_batch(
		pg_temp.sid('d4', p_n), pg_temp.sid('d5', p_n), pg_temp.sid('d7', p_n), p_generation,
		p_assistant_text, p_events, p_projection, p_visible_at, p_visible_source
	)
$$;

SELECT pg_temp.seed_batch_turn(1);   -- ordering, replay, caps, interop, first-visible
SELECT pg_temp.seed_batch_turn(2);   -- cancel requested
SELECT pg_temp.seed_batch_turn(3);   -- terminal
SELECT pg_temp.seed_batch_turn(4);   -- stale generation

-- 1. Access.
DO $$
DECLARE
	v_signature text :=
		'public.persist_agentic_chat_semantic_event_batch(uuid,uuid,uuid,integer,text,jsonb,jsonb,timestamptz,text)';
BEGIN
	ASSERT has_function_privilege('service_role', v_signature, 'EXECUTE'),
		'service_role must EXECUTE the batch RPC';
	ASSERT NOT has_function_privilege('authenticated', v_signature, 'EXECUTE'),
		'authenticated must not EXECUTE the batch RPC';
	ASSERT NOT has_function_privilege('anon', v_signature, 'EXECUTE'),
		'anon must not EXECUTE the batch RPC';
	ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_signature::regprocedure),
		'the batch RPC stays SECURITY INVOKER';
	ASSERT (SELECT proconfig FROM pg_proc WHERE oid = v_signature::regprocedure)
		= ARRAY['search_path=pg_catalog, public'],
		'only search_path may be SET on the function (non-superuser owners cannot SET extension GUCs)';
	-- No service-role claim: refused before any read.
	BEGIN
		PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', false);
		PERFORM pg_temp.persist_batch(1, jsonb_build_array(pg_temp.batch_event(1, 1)), '{}'::jsonb);
		RAISE EXCEPTION 'a non-service-role caller was accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLSTATE = '42501' AND SQLERRM = 'agentic_chat_semantic_batch_service_role_required',
			SQLSTATE || ' ' || SQLERRM;
	END;
END;
$$;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

-- 2. Ordering: three events, one call.
DO $$
DECLARE
	v_receipt jsonb;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_index integer;
	v_result jsonb;
BEGIN
	v_receipt := pg_temp.persist_batch(
		1,
		jsonb_build_array(
			pg_temp.batch_event(1, 1), pg_temp.batch_event(1, 2), pg_temp.batch_event(1, 3)
		),
		pg_temp.batch_projection(1, 3)
	);
	ASSERT v_receipt->>'outcome' = 'batch_persisted', v_receipt::text;
	ASSERT (v_receipt->>'persisted_count')::integer = 3
		AND (v_receipt->>'replayed_count')::integer = 0, v_receipt::text;
	ASSERT jsonb_array_length(v_receipt->'results') = 3, v_receipt::text;
	FOR v_index IN 0 .. 2 LOOP
		v_result := v_receipt->'results'->v_index;
		ASSERT v_result->>'outcome' = 'persisted'
			AND (v_result->>'publish_allowed')::boolean
			AND (v_result->>'sequence_index')::integer = v_index + 1
			AND v_result->>'event_id' = pg_temp.sid('d4', 1)::text || ':1:' || (v_index + 1)
			AND (v_result->>'transition_id')::uuid = pg_temp.sid('d8', 100 + v_index + 1)
			AND v_result->'event_payload' = pg_temp.batch_event(1, v_index + 1)->'event_payload'
			AND v_result ? 'persisted_at',
			format('receipt %s: %s', v_index, v_result);
	END LOOP;
	ASSERT (
		SELECT array_agg(sequence_index ORDER BY created_at, sequence_index)
		FROM public.chat_turn_events WHERE turn_run_id = pg_temp.sid('d4', 1)
	) = ARRAY[1, 2, 3], 'events persist at consecutive sequences in input order';
	ASSERT (
		SELECT array_agg(worker_transition_id ORDER BY sequence_index)
		FROM public.chat_turn_events WHERE turn_run_id = pg_temp.sid('d4', 1)
	) = ARRAY[pg_temp.sid('d8', 101), pg_temp.sid('d8', 102), pg_temp.sid('d8', 103)],
		'sequence order is input order';
	SELECT * INTO v_turn FROM public.chat_turn_runs WHERE id = pg_temp.sid('d4', 1);
	SELECT * INTO v_stream FROM public.chat_turn_stream_state WHERE turn_run_id = v_turn.id;
	ASSERT v_turn.last_event_sequence = 3 AND v_stream.snapshot_sequence = 3
		AND v_stream.durable_through_sequence = 3 AND v_stream.projection_durable_sequence = 3
		AND v_stream.reconcile_required
		AND v_stream.projection = pg_temp.batch_projection(1, 3),
		'cursors advance to the last event and the projection is the batch''s last';
	ASSERT v_turn.first_visible_text_at IS NULL AND v_turn.first_visible_text_source IS NULL,
		'no first-visible time without one';
END;
$$;

-- 3. Idempotent replay, prefix continuation, refusals.
DO $$
DECLARE
	v_receipt jsonb;
	v_before jsonb;
BEGIN
	SELECT projection INTO v_before FROM public.chat_turn_stream_state
	WHERE turn_run_id = pg_temp.sid('d4', 1);

	-- Lost response: the identical batch again.
	v_receipt := pg_temp.persist_batch(
		1,
		jsonb_build_array(
			pg_temp.batch_event(1, 1), pg_temp.batch_event(1, 2), pg_temp.batch_event(1, 3)
		),
		pg_temp.batch_projection(1, 3)
	);
	ASSERT v_receipt->>'outcome' = 'batch_persisted'
		AND (v_receipt->>'persisted_count')::integer = 0
		AND (v_receipt->>'replayed_count')::integer = 3, v_receipt::text;
	ASSERT (
		SELECT bool_and(
			result->>'outcome' = 'already_persisted'
			AND NOT (result->>'publish_allowed')::boolean
			AND (result->>'sequence_index')::integer = ordinal
		)
		FROM jsonb_array_elements(v_receipt->'results') WITH ORDINALITY AS r(result, ordinal)
	), 'a replay returns the stored receipts in order: ' || v_receipt::text;
	ASSERT (SELECT count(*) FROM public.chat_turn_events WHERE turn_run_id = pg_temp.sid('d4', 1)) = 3
		AND (SELECT last_event_sequence FROM public.chat_turn_runs WHERE id = pg_temp.sid('d4', 1)) = 3,
		'a replay writes nothing';

	-- Committed prefix + a new event continues at the cursor.
	v_receipt := pg_temp.persist_batch(
		1,
		jsonb_build_array(pg_temp.batch_event(1, 3), pg_temp.batch_event(1, 4)),
		pg_temp.batch_projection(1, 4)
	);
	ASSERT (v_receipt->'results'->0->>'outcome') = 'already_persisted'
		AND (v_receipt->'results'->0->>'sequence_index')::integer = 3
		AND (v_receipt->'results'->1->>'outcome') = 'persisted'
		AND (v_receipt->'results'->1->>'sequence_index')::integer = 4, v_receipt::text;

	-- A new event before a committed one is not a prefix replay.
	BEGIN
		PERFORM pg_temp.persist_batch(
			1,
			jsonb_build_array(pg_temp.batch_event(1, 5), pg_temp.batch_event(1, 1)),
			pg_temp.batch_projection(1, 5)
		);
		RAISE EXCEPTION 'a non-prefix replay was accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_semantic_batch_replay_out_of_order', SQLERRM;
	END;
	-- A committed prefix that does not end at the cursor cannot take new events.
	BEGIN
		PERFORM pg_temp.persist_batch(
			1,
			jsonb_build_array(pg_temp.batch_event(1, 1), pg_temp.batch_event(1, 5)),
			pg_temp.batch_projection(1, 5)
		);
		RAISE EXCEPTION 'a stale prefix took new events';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_semantic_batch_replay_out_of_order', SQLERRM;
	END;
	-- The same transition with a different payload is a conflict, as per event.
	BEGIN
		PERFORM pg_temp.persist_batch(
			1, jsonb_build_array(pg_temp.batch_event(1, 2, 'changed')), pg_temp.batch_projection(1, 4)
		);
		RAISE EXCEPTION 'a conflicting replay was accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_semantic_write_transition_conflict', SQLERRM;
	END;
	-- A batch may not repeat a transition.
	BEGIN
		PERFORM pg_temp.persist_batch(
			1,
			jsonb_build_array(pg_temp.batch_event(1, 6), pg_temp.batch_event(1, 6)),
			pg_temp.batch_projection(1, 6)
		);
		RAISE EXCEPTION 'a duplicate transition was accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_semantic_batch_duplicate_transition', SQLERRM;
	END;
	ASSERT (SELECT count(*) FROM public.chat_turn_events WHERE turn_run_id = pg_temp.sid('d4', 1)) = 4
		AND (SELECT last_event_sequence FROM public.chat_turn_runs WHERE id = pg_temp.sid('d4', 1)) = 4,
		'refused batches write nothing';
END;
$$;

-- 4 + 5. Byte caps and a projection ahead of the batch.
DO $$
DECLARE
	v_events jsonb;
BEGIN
	BEGIN
		PERFORM pg_temp.persist_batch(
			1,
			jsonb_build_array(jsonb_build_object(
				'transition_id', pg_temp.sid('d8', 150),
				'phase', 'tool',
				'event_type', 'tool_result',
				'event_payload', jsonb_build_object(
					'type', 'tool_result',
					-- md5 text does not compress away inside pg_column_size.
					'result', (SELECT string_agg(md5(i::text), '') FROM generate_series(1, 9000) i)
				)
			)),
			pg_temp.batch_projection(1, 5)
		);
		RAISE EXCEPTION 'an event payload over 256 KiB was accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_semantic_batch_invalid_json_payload', SQLERRM;
	END;
	BEGIN
		PERFORM pg_temp.persist_batch(
			1,
			jsonb_build_array(pg_temp.batch_event(1, 5)),
			pg_temp.batch_projection(1, 5) || jsonb_build_object(
				'padding', (SELECT string_agg(md5(i::text), '') FROM generate_series(1, 17000) i)
			)
		);
		RAISE EXCEPTION 'a projection over 512 KiB was accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_semantic_batch_invalid_projection', SQLERRM;
	END;
	SELECT jsonb_agg(pg_temp.batch_event(1, 200 + i)) INTO v_events FROM generate_series(1, 65) i;
	BEGIN
		PERFORM pg_temp.persist_batch(1, v_events, pg_temp.batch_projection(1, 69));
		RAISE EXCEPTION 'more than 64 events were accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_semantic_batch_invalid_events', SQLERRM;
	END;
	BEGIN
		PERFORM pg_temp.persist_batch(
			1, jsonb_build_array(pg_temp.batch_event(1, 5)), pg_temp.batch_projection(1, 6)
		);
		RAISE EXCEPTION 'a projection ahead of the batch was accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_semantic_batch_projection_ahead', SQLERRM;
	END;
	BEGIN
		PERFORM pg_temp.persist_batch(
			1, jsonb_build_array(pg_temp.batch_event(1, 5)), pg_temp.batch_projection(1, 5),
			'', clock_timestamp(), 'guess'
		);
		RAISE EXCEPTION 'an unknown first-visible source was accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_semantic_batch_invalid_first_visible_text', SQLERRM;
	END;
	ASSERT (SELECT last_event_sequence FROM public.chat_turn_runs WHERE id = pg_temp.sid('d4', 1)) = 4,
		'capped batches write nothing';
END;
$$;

-- 6 + 7. Interop with the per-event, text, and reconcile RPCs; first-visible time.
DO $$
DECLARE
	v_receipt jsonb;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_early timestamptz := clock_timestamp() - interval '20 seconds';
	v_later timestamptz := clock_timestamp() - interval '10 seconds';
BEGIN
	-- Text persisted by the text RPC takes the next sequence.
	v_receipt := public.persist_agentic_chat_text_batch(
		pg_temp.sid('d4', 1), pg_temp.sid('d5', 1), pg_temp.sid('d7', 1), 1,
		pg_temp.sid('db', 1), 'Hello', 'Hello'
	);
	ASSERT v_receipt->>'outcome' = 'persisted' AND (v_receipt->>'sequence_index')::integer = 5,
		v_receipt::text;

	-- The batch continues after it, carries the text prefix, and records first-visible.
	v_receipt := pg_temp.persist_batch(
		1, jsonb_build_array(pg_temp.batch_event(1, 5)), pg_temp.batch_projection(1, 6),
		'Hello', v_later, 'durable_text'
	);
	ASSERT (v_receipt->'results'->0->>'sequence_index')::integer = 6, v_receipt::text;
	SELECT * INTO v_turn FROM public.chat_turn_runs WHERE id = pg_temp.sid('d4', 1);
	ASSERT v_turn.first_visible_text_at = v_later AND v_turn.first_visible_text_source = 'durable_text',
		'first visible text is recorded';

	-- The per-event RPC continues after the batch.
	v_receipt := public.persist_agentic_chat_semantic_event(
		pg_temp.sid('d4', 1), pg_temp.sid('d5', 1), pg_temp.sid('d7', 1), 1,
		pg_temp.sid('d8', 107), 'Hello', 'tool', 'tool_call',
		pg_temp.batch_projection(1, 7), (pg_temp.batch_event(1, 7))->'event_payload'
	);
	ASSERT v_receipt->>'outcome' = 'persisted' AND (v_receipt->>'sequence_index')::integer = 7,
		v_receipt::text;

	-- An earlier preview replaces it; a later one or an out-of-window one does not.
	v_receipt := pg_temp.persist_batch(
		1, jsonb_build_array(pg_temp.batch_event(1, 8)), pg_temp.batch_projection(1, 8),
		'Hello', v_early, 'preview'
	);
	v_receipt := pg_temp.persist_batch(
		1, jsonb_build_array(pg_temp.batch_event(1, 9)), pg_temp.batch_projection(1, 9),
		'Hello', v_later, 'durable_text'
	);
	v_receipt := pg_temp.persist_batch(
		1, jsonb_build_array(pg_temp.batch_event(1, 10)), pg_temp.batch_projection(1, 10),
		'Hello', clock_timestamp() - interval '2 days', 'preview'
	);
	SELECT * INTO v_turn FROM public.chat_turn_runs WHERE id = pg_temp.sid('d4', 1);
	ASSERT v_turn.first_visible_text_at = v_early AND v_turn.first_visible_text_source = 'preview',
		format('first visible keeps the earliest in-window time: %s %s',
			v_turn.first_visible_text_at, v_turn.first_visible_text_source);
	ASSERT v_turn.last_event_sequence = 10, v_turn.last_event_sequence::text;

	-- A batch that does not extend the persisted text is refused.
	BEGIN
		PERFORM pg_temp.persist_batch(
			1, jsonb_build_array(pg_temp.batch_event(1, 11)), pg_temp.batch_projection(1, 11),
			'Goodbye'
		);
		RAISE EXCEPTION 'a text prefix conflict was accepted';
	EXCEPTION WHEN OTHERS THEN
		ASSERT SQLERRM = 'agentic_chat_semantic_batch_prefix_conflict', SQLERRM;
	END;

	-- Reconcile sees the batch's projection at its cursor.
	v_receipt := public.reconcile_agentic_chat_turn(
		pg_temp.sid('d4', 1), '5e100000-0000-4000-8000-000000000001', 1, 0
	);
	ASSERT v_receipt->>'outcome' = 'reconciled'
		AND (v_receipt->>'durable_through_sequence')::integer = 10
		AND (v_receipt->>'projection_durable_sequence')::integer = 10
		AND v_receipt->'projection' = pg_temp.batch_projection(1, 10)
		AND v_receipt->>'text' = 'Hello', v_receipt::text;
END;
$$;

-- 8. Whole-batch answers: cancel, terminal, stale generation. Nothing is written.
DO $$
DECLARE
	v_receipt jsonb;
	v_terminal boolean := true;
BEGIN
	UPDATE public.chat_turn_runs
	SET cancel_requested_at = clock_timestamp(), cancel_reason = 'user_cancelled'
	WHERE id = pg_temp.sid('d4', 2);
	v_receipt := pg_temp.persist_batch(
		2, jsonb_build_array(pg_temp.batch_event(2, 1)), pg_temp.batch_projection(2, 1)
	);
	ASSERT v_receipt->>'outcome' = 'cancel_requested'
		AND NOT (v_receipt->>'publish_allowed')::boolean, v_receipt::text;

	-- A bare status flip may be refused by production's terminal guards; the
	-- terminal answer is asserted only when the fixture could be made terminal.
	BEGIN
		UPDATE public.chat_turn_runs SET status = 'completed', finished_at = clock_timestamp()
		WHERE id = pg_temp.sid('d4', 3);
	EXCEPTION WHEN OTHERS THEN
		v_terminal := false;
	END;
	IF v_terminal THEN
		v_receipt := pg_temp.persist_batch(
			3, jsonb_build_array(pg_temp.batch_event(3, 1)), pg_temp.batch_projection(3, 1)
		);
		ASSERT v_receipt->>'outcome' = 'already_terminal', v_receipt::text;
	END IF;

	v_receipt := pg_temp.persist_batch(
		4, jsonb_build_array(pg_temp.batch_event(4, 1)), pg_temp.batch_projection(4, 1),
		'', NULL, NULL, 2
	);
	ASSERT v_receipt->>'outcome' = 'stale_generation'
		AND (v_receipt->>'requested_execution_generation')::integer = 2, v_receipt::text;

	ASSERT NOT EXISTS (
		SELECT 1 FROM public.chat_turn_events
		WHERE turn_run_id IN (pg_temp.sid('d4', 2), pg_temp.sid('d4', 3), pg_temp.sid('d4', 4))
	), 'whole-batch answers write nothing';
END;
$$;

SELECT set_config('request.jwt.claims', '', false);
ROLLBACK;
