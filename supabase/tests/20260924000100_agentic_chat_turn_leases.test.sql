-- supabase/tests/20260924000100_agentic_chat_turn_leases.test.sql
-- Turn-lease contract: the single liveness policy, fenced renewal, dead-turn
-- recovery (requeue, finalize with partial text, claim gap, unreconciled
-- queue rows, unleased pre-lease turns, workflow handoff/deferral/abandon),
-- terminal effect closure, the recover_agentic_chat_turn effect patch, Stop on
-- a dead worker, and the fences a slow-but-alive worker hits afterwards.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked, staging,
-- or production database.

\set ON_ERROR_STOP on
\ir fixtures/agentic_chat_workflow_v1_base.sql
-- The effect RPCs are not part of the workflow fixture extract.
\ir ../migrations/20260801041100_agentic_chat_worker_effect_rpcs.sql
\ir ../migrations/20260914203007_agentic_chat_workflow_v1_storage.sql
\ir ../migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql
\ir ../migrations/20260924000000_agentic_chat_reap_stranded_queued_turns.sql
\ir ../migrations/20260924000100_agentic_chat_turn_leases.sql
-- Re-applying is a no-op (idempotent columns, functions, and patches).
\ir ../migrations/20260924000100_agentic_chat_turn_leases.sql

SET client_min_messages = warning;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_expected text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
	EXECUTE p_sql;
	RETURN false;
EXCEPTION
	WHEN OTHERS THEN
		RETURN SQLERRM LIKE '%' || p_expected || '%';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_prefix text, p_n integer)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT (p_prefix || '000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_service(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
	v_result jsonb;
BEGIN
	SET LOCAL ROLE service_role;
	EXECUTE p_sql INTO v_result;
	RESET ROLE;
	RETURN v_result;
END;
$$;

-- One ordinary worker turn in its own session. Ages are how long ago the lease
-- was renewed (NULL = never renewed at this generation) and how long ago the
-- queue row was last written (its heartbeat).
CREATE OR REPLACE FUNCTION pg_temp.seed_turn(
	p_n integer,
	p_status text,
	p_job_status public.queue_status,
	p_generation integer,
	p_started boolean,
	p_lease_age interval,
	p_heartbeat_age interval,
	p_text text DEFAULT '',
	p_cancel boolean DEFAULT false,
	p_attempts integer DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
	v_user uuid := pg_temp.id('e1', 1);
	v_turn uuid := pg_temp.id('e4', p_n);
	v_now timestamptz := clock_timestamp();
BEGIN
	INSERT INTO public.chat_sessions (id, user_id, context_type, status)
	VALUES (pg_temp.id('e2', p_n), v_user, 'global', 'active');
	INSERT INTO public.queue_jobs (
		id, user_id, job_type, metadata, scheduled_for, dedup_key, status, queue_job_id,
		processing_token, started_at, attempts, max_attempts, created_at, updated_at
	) VALUES (
		pg_temp.id('e5', p_n), v_user, 'agentic_chat_turn',
		jsonb_build_object('turnRunId', v_turn, 'correlationId', pg_temp.id('e6', p_n)),
		v_now - interval '10 minutes', 'agentic-chat-turn:' || v_turn, p_job_status,
		'lease_' || p_n,
		CASE WHEN p_job_status = 'processing' THEN pg_temp.id('e7', p_n) END,
		CASE WHEN p_job_status = 'processing' THEN v_now - interval '5 minutes' END,
		p_attempts, 3, v_now - interval '10 minutes', v_now - p_heartbeat_age
	);
	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, client_turn_id, context_type,
		request_message, status, execution_mode, queue_job_id, correlation_id,
		execution_generation, worker_started_at, execution_started_at, last_event_sequence,
		cancel_requested_at, cancel_reason, worker_lease_generation, worker_lease_renewed_at,
		started_at, created_at
	) VALUES (
		v_turn, pg_temp.id('e2', p_n), v_user,
		'lease-stream-' || p_n, 'lease-client-' || p_n,
		'global', 'lease fixture ' || p_n, p_status, 'worker_realtime',
		pg_temp.id('e5', p_n), pg_temp.id('e6', p_n), p_generation,
		CASE WHEN p_generation > 0 THEN v_now - interval '5 minutes' END,
		CASE WHEN p_started THEN v_now - interval '290 seconds' END,
		0,
		CASE WHEN p_cancel THEN v_now - interval '20 seconds' END,
		CASE WHEN p_cancel THEN 'user_cancelled' END,
		CASE WHEN p_lease_age IS NOT NULL THEN p_generation END,
		CASE WHEN p_lease_age IS NOT NULL THEN v_now - p_lease_age END,
		v_now - interval '10 minutes', v_now - interval '10 minutes'
	);
	IF p_generation > 0 THEN
		INSERT INTO public.chat_turn_stream_state (
			turn_run_id, session_id, user_id, execution_generation, assistant_text,
			projection, created_at, updated_at
		) VALUES (
			v_turn, pg_temp.id('e2', p_n), v_user, p_generation, p_text,
			jsonb_build_object('version', 'agentic_chat_worker_ui_projection_v1',
				'current_activity', 'Thinking…', 'semantic_events', '[]'::jsonb),
			v_now - interval '5 minutes', v_now - interval '5 minutes'
		);
	END IF;
	IF p_cancel THEN
		INSERT INTO public.chat_turn_signals (turn_run_id, session_id, user_id, reason, source, created_at)
		VALUES (v_turn, pg_temp.id('e2', p_n), v_user, 'user_cancelled', 'browser', v_now - interval '20 seconds');
	END IF;
END;
$$;

-- A reserved effect, optionally advanced to started.
CREATE OR REPLACE FUNCTION pg_temp.seed_effect(p_turn integer, p_effect integer, p_started boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	INSERT INTO public.chat_turn_effects (
		id, turn_run_id, session_id, user_id, execution_generation, tool_name, operation_name,
		canonical_argument_hash, downstream_idempotency_supported
	) VALUES (
		pg_temp.id('e8', p_effect), pg_temp.id('e4', p_turn), pg_temp.id('e2', p_turn),
		pg_temp.id('e1', 1), 1, 'create_calendar_event', 'calendar.create',
		repeat('a', 64), false
	);
	IF p_started THEN
		UPDATE public.chat_turn_effects
		SET state = 'started', started_at = clock_timestamp()
		WHERE id = pg_temp.id('e8', p_effect);
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.renew(p_n integer, p_token uuid, p_generation integer)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT pg_temp.as_service(format(
		'SELECT public.renew_agentic_chat_turn_lease(%L::uuid, %L::uuid, %L::uuid, %s)',
		pg_temp.id('e4', p_n), pg_temp.id('e5', p_n), p_token, p_generation
	))
$$;

CREATE OR REPLACE FUNCTION pg_temp.recover(p_batch integer, p_handoff boolean)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT pg_temp.as_service(format(
		'SELECT public.recover_dead_agentic_chat_turns(%s, %L::boolean)', p_batch, p_handoff
	))
$$;

CREATE OR REPLACE FUNCTION pg_temp.result_for(p_report jsonb, p_n integer)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT result
	FROM jsonb_array_elements(p_report->'results') result
	WHERE result->>'turn_run_id' = pg_temp.id('e4', p_n)::text
$$;

CREATE OR REPLACE FUNCTION pg_temp.result_for_turn(p_report jsonb, p_turn uuid)
RETURNS jsonb
LANGUAGE sql
AS $$
	SELECT result
	FROM jsonb_array_elements(p_report->'results') result
	WHERE result->>'turn_run_id' = p_turn::text
$$;

INSERT INTO public.users (id) VALUES ('e1000000-0000-4000-8000-000000000001');
INSERT INTO auth.users (id) VALUES ('e1000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Static contract
-- ---------------------------------------------------------------------------

DO $$
DECLARE
	v_function regprocedure;
BEGIN
	FOREACH v_function IN ARRAY ARRAY[
		'public.agentic_chat_turn_lease_state_v1(text,integer,integer,timestamptz,timestamptz,timestamptz)'::regprocedure,
		'public.renew_agentic_chat_turn_lease(uuid,uuid,uuid,integer)'::regprocedure,
		'public.agentic_chat_finalize_dead_turn_v1(uuid,text,text,text,boolean)'::regprocedure,
		'public.agentic_chat_recover_dead_turn_v1(uuid,text,boolean,boolean)'::regprocedure,
		'public.recover_dead_agentic_chat_turns(integer,boolean)'::regprocedure
	] LOOP
		PERFORM pg_temp.assert_true(
			NOT has_function_privilege('anon', v_function, 'EXECUTE')
				AND NOT has_function_privilege('authenticated', v_function, 'EXECUTE')
				AND has_function_privilege('service_role', v_function, 'EXECUTE'),
			v_function::text || ' is not service-only'
		);
		PERFORM pg_temp.assert_true(
			EXISTS (
				SELECT 1 FROM pg_catalog.pg_proc procedures
				WHERE procedures.oid = v_function
					AND NOT procedures.prosecdef
					AND procedures.proconfig @> ARRAY['search_path=pg_catalog, public']::text[]
			),
			v_function::text || ' is not a pinned-search-path security invoker'
		);
	END LOOP;
	PERFORM pg_temp.assert_true(
		position('FOR UPDATE SKIP LOCKED' IN pg_get_functiondef(
			'public.recover_dead_agentic_chat_turns(integer,boolean)'::regprocedure)) > 0
			AND EXISTS (
				SELECT 1 FROM pg_catalog.pg_proc procedures
				WHERE procedures.oid = 'public.recover_dead_agentic_chat_turns(integer,boolean)'::regprocedure
					AND procedures.proconfig @> ARRAY['lock_timeout=2s']::text[]
			),
		'recovery batch does not lock turns one at a time with SKIP LOCKED and a lock timeout'
	);
	-- Only the old draft signatures would make three-argument calls ambiguous.
	PERFORM pg_temp.assert_true(
		(SELECT count(*) FROM pg_proc WHERE proname = 'agentic_chat_recover_dead_turn_v1') = 1
			AND (SELECT count(*) FROM pg_proc WHERE proname = 'agentic_chat_finalize_dead_turn_v1') = 1,
		'dead-turn functions have more than one overload'
	);
	PERFORM pg_temp.assert_true(
		NOT has_table_privilege('anon', 'public.chat_turn_recovery_failures', 'SELECT')
			AND NOT has_table_privilege('authenticated', 'public.chat_turn_recovery_failures', 'SELECT')
			AND (SELECT relrowsecurity FROM pg_class
				WHERE oid = 'public.chat_turn_recovery_failures'::regclass)
			AND EXISTS (
				SELECT 1 FROM pg_constraint
				WHERE conname = 'chk_chat_turn_runs_worker_lease' AND NOT convalidated
			),
		'failure ledger is not service-only, or the lease check was validated under lock'
	);
	PERFORM pg_temp.assert_true(
		position('GREATEST(turns.created_at, jobs.updated_at) <= v_cutoff' IN pg_get_functiondef(
			'public.reap_stranded_queued_agentic_chat_turns(integer,integer)'::regprocedure)) > 0,
		'the queued reaper still times requeued turns from admission'
	);
	PERFORM pg_temp.assert_true(
		position('effect_reconciliation_required' IN pg_get_functiondef(
			'public.recover_agentic_chat_turn(uuid,uuid,uuid,integer,text,text)'::regprocedure)) = 0,
		'recover_agentic_chat_turn can still park a turn on its effects'
	);
	PERFORM pg_temp.assert_true(
		EXISTS (
			SELECT 1 FROM pg_trigger
			WHERE tgname = 'trg_chat_turn_runs_resolve_effects_on_terminal'
				AND tgrelid = 'public.chat_turn_runs'::regclass
		),
		'terminal effect trigger is missing'
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- The single liveness policy
-- ---------------------------------------------------------------------------

DO $$
DECLARE
	v_now timestamptz := '2026-09-24T12:00:00Z';
	v_case record;
BEGIN
	FOR v_case IN
		SELECT * FROM (VALUES
			-- status, generation, lease generation, lease age (s), heartbeat age (s), expected
			('running', 1, 1, 10, 900, 'held'),
			('running', 1, 1, 44, 900, 'held'),
			('running', 1, 1, 45, 900, 'stale'),
			('running', 1, 1, 89, 900, 'stale'),
			('running', 1, 1, 90, 0, 'expired'),
			('running', 1, 1, 179, 0, 'expired'),
			('running', 1, 1, 180, 0, 'abandoned'),
			-- No lease for this generation: the old heartbeat rule, never stale.
			('running', 1, NULL, NULL, 60, 'held'),
			('running', 1, NULL, NULL, 419, 'held'),
			('running', 1, NULL, NULL, 420, 'expired'),
			('running', 1, NULL, NULL, 840, 'abandoned'),
			('running', 2, 1, 5, 419, 'held'),
			('running', 2, 1, 5, 420, 'expired'),
			-- Claimed queue row, turn never claimed; terminal turn, row unreleased.
			('queued', 0, NULL, NULL, 89, 'held'),
			('queued', 0, NULL, NULL, 90, 'expired'),
			('failed', 1, 1, 5, 90, 'expired')
		) AS cases(status, generation, lease_generation, lease_age, heartbeat_age, expected)
	LOOP
		PERFORM pg_temp.assert_true(
			public.agentic_chat_turn_lease_state_v1(
				v_case.status,
				v_case.generation,
				v_case.lease_generation,
				v_now - make_interval(secs => v_case.lease_age),
				v_now - make_interval(secs => v_case.heartbeat_age),
				v_now
			) = v_case.expected,
			format('lease state for %s', row_to_json(v_case))
		);
	END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Renewal: fenced by status, generation, token, and an unexpired lease
-- ---------------------------------------------------------------------------

SELECT pg_temp.seed_turn(1, 'running', 'processing', 1, true, NULL, interval '30 seconds');
SELECT pg_temp.seed_turn(2, 'running', 'processing', 1, true, interval '100 seconds', interval '30 seconds');
SELECT pg_temp.seed_turn(3, 'queued', 'pending', 0, false, NULL, interval '30 seconds');

SET ROLE authenticated;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		format('SELECT public.renew_agentic_chat_turn_lease(%L::uuid, %L::uuid, %L::uuid, 1)',
			pg_temp.id('e4', 1), pg_temp.id('e5', 1), pg_temp.id('e7', 1)),
		'permission denied'
	),
	'authenticated callers can renew a lease'
);
RESET ROLE;

DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	-- First renewal of a claimed generation makes it leased.
	v_receipt := pg_temp.renew(1, pg_temp.id('e7', 1), 1);
	PERFORM pg_temp.assert_true(
		v_receipt->>'outcome' = 'renewed' AND (v_receipt->>'execution_generation')::integer = 1,
		'first renewal was refused: ' || v_receipt::text
	);
	PERFORM pg_temp.assert_true(
		(SELECT worker_lease_generation = 1
			AND worker_lease_renewed_at > clock_timestamp() - interval '5 seconds'
			FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 1)),
		'renewal did not stamp the lease'
	);
	PERFORM pg_temp.assert_true(
		pg_temp.renew(1, gen_random_uuid(), 1) @> '{"outcome":"lost","reason":"ownership_lost"}',
		'renewal with a foreign token was accepted'
	);
	PERFORM pg_temp.assert_true(
		pg_temp.renew(1, pg_temp.id('e7', 1), 2) @> '{"outcome":"lost","reason":"generation_changed"}',
		'renewal for another generation was accepted'
	);
	PERFORM pg_temp.assert_true(
		pg_temp.renew(3, pg_temp.id('e7', 3), 1) @> '{"outcome":"lost"}',
		'renewal of a queued turn was accepted'
	);
	-- An expired lease is never revived, and renewal leaves it untouched.
	PERFORM pg_temp.assert_true(
		pg_temp.renew(2, pg_temp.id('e7', 2), 1) @> '{"outcome":"lost","reason":"lease_expired"}',
		'an expired lease was revived'
	);
	PERFORM pg_temp.assert_true(
		(SELECT worker_lease_renewed_at < clock_timestamp() - interval '90 seconds'
			FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 2)),
		'a refused renewal moved the lease'
	);
	PERFORM pg_temp.assert_true(
		pg_temp.expect_error(
			'SELECT pg_temp.as_service(''SELECT public.renew_agentic_chat_turn_lease(NULL, NULL, NULL, 1)'')',
			'agentic_chat_lease_invalid_request'
		),
		'renewal accepted a null identity'
	);
END;
$$;

-- Clear the renewal fixtures so recovery below sees only its own seeds.
SELECT pg_temp.recover(100, false);

SELECT pg_temp.assert_true(
	(SELECT status = 'failed' AND finished_reason = 'worker_interrupted'
		FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 2)),
	'the expired renewal fixture was not recovered'
);

-- ---------------------------------------------------------------------------
-- Recovery: every transition
-- ---------------------------------------------------------------------------

-- 10: leased, model never started, lease expired              -> requeued
-- 11: leased, started, lease expired, partial text            -> failed, text kept
-- 12: leased, fresh lease                                     -> untouched
-- 13: leased, stale lease, no Stop                            -> untouched
-- 14: leased, stale lease, Stop pending, partial text         -> cancelled, message kept
-- 15: unleased (pre-lease worker), heartbeat 300 s            -> untouched (420 s rule)
-- 16: unleased, heartbeat 500 s, started                      -> failed
-- 17: leased, started, expired, one reserved + one started effect -> uncertain_external_commit
-- 18: queue row claimed, turn never claimed, heartbeat 100 s  -> row released to pending
-- 19: same, attempts exhausted                                -> queued timeout (cancelled)
-- 20: terminal turn whose queue row was never released        -> row reconciled
-- 21: lease from an older generation, fresh heartbeat         -> untouched
SELECT pg_temp.seed_turn(10, 'running', 'processing', 1, false, interval '100 seconds', interval '30 seconds');
SELECT pg_temp.seed_turn(11, 'running', 'processing', 1, true, interval '120 seconds', interval '30 seconds', 'Here is the start of');
SELECT pg_temp.seed_turn(12, 'running', 'processing', 1, true, interval '10 seconds', interval '30 seconds');
SELECT pg_temp.seed_turn(13, 'running', 'processing', 1, true, interval '60 seconds', interval '30 seconds');
SELECT pg_temp.seed_turn(14, 'running', 'processing', 1, true, interval '60 seconds', interval '30 seconds', 'Partial before Stop', true);
SELECT pg_temp.seed_turn(15, 'running', 'processing', 1, true, NULL, interval '300 seconds');
SELECT pg_temp.seed_turn(16, 'running', 'processing', 1, true, NULL, interval '500 seconds');
SELECT pg_temp.seed_turn(17, 'running', 'processing', 1, true, interval '100 seconds', interval '30 seconds');
SELECT pg_temp.seed_effect(17, 1, false);
SELECT pg_temp.seed_effect(17, 2, true);
SELECT pg_temp.seed_turn(18, 'queued', 'processing', 0, false, NULL, interval '100 seconds');
SELECT pg_temp.seed_turn(19, 'queued', 'processing', 0, false, NULL, interval '100 seconds', '', false, 2);
SELECT pg_temp.seed_turn(21, 'running', 'processing', 2, true, interval '5 seconds', interval '30 seconds');
UPDATE public.chat_turn_runs SET worker_lease_generation = 1 WHERE id = pg_temp.id('e4', 21);

-- 20: a finalized turn whose worker died before releasing the queue row.
SELECT pg_temp.seed_turn(20, 'running', 'processing', 1, true, interval '5 seconds', interval '1 second');
SELECT pg_temp.as_service(format(
	'SELECT public.finalize_agentic_chat_turn(%L::uuid, %L::uuid, %L::uuid, %L::uuid, 1, ''failed'', ''error'', ''permanent'', NULL, '''', ''{}''::jsonb, NULL, NULL, NULL, ''{}''::jsonb, ''{}''::jsonb)',
	pg_temp.id('e4', 20), pg_temp.id('e1', 1), pg_temp.id('e5', 20), pg_temp.id('e7', 20)
));
-- Only a direct write can age a heartbeat (the table trigger stamps now()).
ALTER TABLE public.queue_jobs DISABLE TRIGGER update_queue_jobs_updated_at;
UPDATE public.queue_jobs SET updated_at = clock_timestamp() - interval '100 seconds'
WHERE id = pg_temp.id('e5', 20);
ALTER TABLE public.queue_jobs ENABLE TRIGGER update_queue_jobs_updated_at;

SET ROLE authenticated;
SELECT pg_temp.assert_true(
	pg_temp.expect_error('SELECT public.recover_dead_agentic_chat_turns(25, false)', 'permission denied'),
	'authenticated callers can run recovery'
);
RESET ROLE;

-- Batch bound: one row per call, oldest silence first (16: 500 s).
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(1, false);
BEGIN
	PERFORM pg_temp.assert_true(
		(v_report->>'candidate_count')::integer = 1
			AND (v_report->>'has_more')::boolean
			AND (v_report->>'batch_size')::integer = 1
			AND pg_temp.result_for(v_report, 16) IS NOT NULL,
		'recovery did not take the oldest dead turn first: ' || v_report::text
	);
END;
$$;

DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, false);
BEGIN
	PERFORM pg_temp.assert_true(
		(v_report->>'candidate_count')::integer = 7
			AND (v_report->>'requeued_count')::integer = 2
			AND (v_report->>'finalized_count')::integer = 4
			AND (v_report->>'reconciled_count')::integer = 1
			AND (v_report->>'failed_count')::integer = 0
			AND NOT (v_report->>'has_more')::boolean
			AND jsonb_array_length(v_report->'handoffs') = 0
			AND position('processing_token' IN (v_report->'results')::text) = 0,
		'recovery batch report is wrong: ' || v_report::text
	);
	PERFORM pg_temp.assert_true(
		pg_temp.result_for(v_report, 10)->>'outcome' = 'requeued'
			AND pg_temp.result_for(v_report, 11)->>'outcome' = 'finalized'
			AND pg_temp.result_for(v_report, 14)->>'outcome' = 'finalized'
			AND pg_temp.result_for(v_report, 17)->>'outcome' = 'finalized'
			AND pg_temp.result_for(v_report, 18)->>'outcome' = 'requeued'
			AND pg_temp.result_for(v_report, 19)->>'outcome' = 'finalized'
			AND pg_temp.result_for(v_report, 20)->>'outcome' = 'terminal_reconciled'
			AND pg_temp.result_for(v_report, 17)->>'failure_code' = 'uncertain_external_commit'
			AND (pg_temp.result_for(v_report, 17)->>'uncertain_effect_count')::integer = 1,
		'per-turn recovery outcomes are wrong: ' || v_report::text
	);
END;
$$;

-- 10: requeued exactly like the worker's own pre-start recovery.
SELECT pg_temp.assert_true(
	(SELECT status = 'queued' AND execution_generation = 1 FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 10))
	AND (SELECT status = 'pending' AND processing_token IS NULL AND attempts = 1
		AND scheduled_for > clock_timestamp()
		FROM public.queue_jobs WHERE id = pg_temp.id('e5', 10)),
	'a never-started dead turn was not requeued'
);

-- 11 and 16: failed, partial text kept, done event, queue row released.
DO $$
DECLARE
	v_n integer;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_event public.chat_turn_events%ROWTYPE;
BEGIN
	FOREACH v_n IN ARRAY ARRAY[11, 16] LOOP
		SELECT * INTO v_turn FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', v_n);
		SELECT * INTO v_event FROM public.chat_turn_events
		WHERE turn_run_id = v_turn.id AND event_id = v_turn.terminal_event_id;
		PERFORM pg_temp.assert_true(
			v_turn.status = 'failed'
				AND v_turn.finished_reason = 'worker_interrupted'
				AND v_turn.failure_code = 'timeout_post_start'
				AND v_turn.assistant_message_id IS NULL
				AND v_event.payload @> '{"type":"done","status":"failed","recovered_from_stall":true,"recovery_trigger":"lease_expired","uncertain_effect_count":0}',
			'dead turn ' || v_n || ' has the wrong terminal: ' || row_to_json(v_turn)::text
		);
		PERFORM pg_temp.assert_true(
			(SELECT status = 'failed' AND processing_token IS NULL AND completed_at IS NOT NULL
				FROM public.queue_jobs WHERE id = pg_temp.id('e5', v_n)),
			'dead turn ' || v_n || ' kept its queue row'
		);
	END LOOP;
	PERFORM pg_temp.assert_true(
		(SELECT assistant_text = 'Here is the start of'
			AND projection->'terminal'->>'status' = 'failed'
			AND projection->>'current_activity' = 'Thinking…'
			FROM public.chat_turn_stream_state WHERE turn_run_id = pg_temp.id('e4', 11)),
		'recovery did not keep the partial text and projection'
	);
END;
$$;

-- 14: a pending Stop is finalized once the lease is stale, with its message.
SELECT pg_temp.assert_true(
	(SELECT status = 'cancelled' AND finished_reason = 'cancelled' AND assistant_message_id IS NOT NULL
		FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 14))
	AND (SELECT content = 'Partial before Stop' AND metadata @> '{"partial":true,"recovered_from_stall":true}'
		FROM public.chat_messages WHERE id = (
			SELECT assistant_message_id FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 14))),
	'a stale-lease Stop was not finalized with its partial message'
);

-- 17: effects closed by the terminal trigger; failure says it may have happened.
SELECT pg_temp.assert_true(
	(SELECT status = 'failed' AND failure_code = 'uncertain_external_commit'
		FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 17))
	AND (SELECT state = 'cancelled' AND started_at IS NULL AND finished_at IS NOT NULL
		AND failure_code = 'turn_ended_before_start'
		FROM public.chat_turn_effects WHERE id = pg_temp.id('e8', 1))
	AND (SELECT state = 'uncertain' AND finished_at IS NOT NULL
		AND failure_code = 'turn_ended_while_in_flight'
		FROM public.chat_turn_effects WHERE id = pg_temp.id('e8', 2)),
	'in-flight effects were not closed at the terminal'
);

-- 18: released; 19: timed out through the queued-cancel path.
SELECT pg_temp.assert_true(
	(SELECT status = 'queued' AND execution_generation = 0 FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 18))
	AND (SELECT status = 'pending' AND processing_token IS NULL AND attempts = 1
		FROM public.queue_jobs WHERE id = pg_temp.id('e5', 18))
	AND (SELECT status = 'cancelled' AND finished_reason = 'timeout' AND terminal_event_id IS NOT NULL
		FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 19))
	AND (SELECT status = 'cancelled' AND processing_token IS NULL
		FROM public.queue_jobs WHERE id = pg_temp.id('e5', 19)),
	'claimed-but-never-started rows were not released or timed out'
);

-- 20: only the queue row moves.
SELECT pg_temp.assert_true(
	(SELECT status = 'failed' AND failure_code = 'permanent' FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 20))
	AND (SELECT status = 'failed' AND processing_token IS NULL FROM public.queue_jobs WHERE id = pg_temp.id('e5', 20)),
	'an unreleased terminal queue row was not reconciled'
);

-- Untouched: live, stale without Stop, unleased under 420 s, older-generation lease.
SELECT pg_temp.assert_true(
	(SELECT bool_and(turns.status = 'running' AND jobs.status = 'processing'
			AND jobs.processing_token = pg_temp.id('e7', n))
		FROM unnest(ARRAY[12, 13, 15, 21]) n
		JOIN public.chat_turn_runs turns ON turns.id = pg_temp.id('e4', n)
		JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id),
	'recovery touched a turn whose worker is alive'
);

-- ---------------------------------------------------------------------------
-- Fences: the slow-but-alive old owner is rejected everywhere
-- ---------------------------------------------------------------------------

DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	-- Terminal turn: renewal lost, text refused, finalize resolves to the truth.
	PERFORM pg_temp.assert_true(
		pg_temp.renew(11, pg_temp.id('e7', 11), 1) @> '{"outcome":"lost","reason":"turn_terminal"}',
		'the old owner renewed a recovered turn'
	);
	v_receipt := pg_temp.as_service(format(
		'SELECT public.persist_agentic_chat_text_batch(%L::uuid, %L::uuid, %L::uuid, 1, gen_random_uuid(), '' more'', ''Here is the start of more'')',
		pg_temp.id('e4', 11), pg_temp.id('e5', 11), pg_temp.id('e7', 11)
	));
	PERFORM pg_temp.assert_true(
		v_receipt->>'outcome' = 'already_terminal'
			AND (SELECT assistant_text = 'Here is the start of'
				FROM public.chat_turn_stream_state WHERE turn_run_id = pg_temp.id('e4', 11)),
		'the old owner appended text after recovery: ' || v_receipt::text
	);
	v_receipt := pg_temp.as_service(format(
		'SELECT public.finalize_agentic_chat_turn(%L::uuid, %L::uuid, %L::uuid, %L::uuid, 1, ''completed'', ''stop'', NULL, gen_random_uuid(), ''late'', ''{}''::jsonb, NULL, NULL, NULL, ''{}''::jsonb, ''{}''::jsonb)',
		pg_temp.id('e4', 11), pg_temp.id('e1', 1), pg_temp.id('e5', 11), pg_temp.id('e7', 11)
	));
	PERFORM pg_temp.assert_true(
		v_receipt->>'outcome' = 'already_terminal' AND v_receipt->>'status' = 'failed',
		'the old owner overwrote the recovered terminal: ' || v_receipt::text
	);
	-- Requeued turn: the cleared token fences renewal, text, effects, and begin.
	PERFORM pg_temp.assert_true(
		pg_temp.renew(10, pg_temp.id('e7', 10), 1) @> '{"outcome":"lost"}',
		'the old owner renewed a requeued turn'
	);
	PERFORM pg_temp.assert_true(
		pg_temp.expect_error(format(
			'SELECT pg_temp.as_service(%L)',
			format('SELECT public.begin_agentic_chat_turn_execution(%L::uuid, %L::uuid, %L::uuid, 1)',
				pg_temp.id('e4', 10), pg_temp.id('e5', 10), pg_temp.id('e7', 10))
		), 'agentic_chat_execution_start_invalid_status'),
		'the old owner started a requeued turn'
	);
	PERFORM pg_temp.assert_true(
		pg_temp.expect_error(format(
			'SELECT pg_temp.as_service(%L)',
			format('SELECT public.reserve_agentic_chat_effect(%L::uuid, %L::uuid, %L::uuid, %L::uuid, 1, ''create_calendar_event'', ''calendar.create'', %L, false)',
				gen_random_uuid(), pg_temp.id('e4', 17), pg_temp.id('e5', 17), pg_temp.id('e7', 17), repeat('b', 64))
		), 'agentic_chat_effect'),
		'the old owner reserved an effect on a recovered turn'
	);
	-- A late settle of the in-flight effect records the truth without ownership.
	v_receipt := pg_temp.as_service(format(
		'SELECT public.reconcile_agentic_chat_effect(%L::uuid, %L::uuid, NULL, NULL, 1, %L, ''succeeded'', ''{"id":"evt_1"}''::jsonb, NULL)',
		pg_temp.id('e8', 2), pg_temp.id('e4', 17), repeat('a', 64)
	));
	PERFORM pg_temp.assert_true(
		v_receipt->>'state' = 'succeeded'
			AND (SELECT uncertain_reconciled_at IS NOT NULL FROM public.chat_turn_effects WHERE id = pg_temp.id('e8', 2)),
		'an uncertain effect could not be reconciled to the truth: ' || v_receipt::text
	);
END;
$$;

-- Idempotent: nothing left to recover.
SELECT pg_temp.assert_true(
	(pg_temp.recover(100, false)->>'candidate_count')::integer = 0,
	'recovery was not idempotent after draining'
);

-- ---------------------------------------------------------------------------
-- recover_agentic_chat_turn from a live worker: effects never park the turn
-- ---------------------------------------------------------------------------

SELECT pg_temp.seed_turn(30, 'running', 'processing', 1, true, interval '5 seconds', interval '5 seconds');
SELECT pg_temp.seed_effect(30, 3, true);
SELECT pg_temp.seed_turn(31, 'running', 'processing', 1, true, interval '5 seconds', interval '5 seconds');
SELECT pg_temp.seed_effect(31, 4, false);

DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := pg_temp.as_service(format(
		'SELECT public.recover_agentic_chat_turn(%L::uuid, %L::uuid, %L::uuid, 1, ''permanent'', ''boom'')',
		pg_temp.id('e4', 30), pg_temp.id('e5', 30), pg_temp.id('e7', 30)
	));
	PERFORM pg_temp.assert_true(
		v_receipt @> '{"outcome":"finalize_failed","failure_code":"uncertain_external_commit","execution_may_retry":false}',
		'a started effect still parks the turn: ' || v_receipt::text
	);
	v_receipt := pg_temp.as_service(format(
		'SELECT public.recover_agentic_chat_turn(%L::uuid, %L::uuid, %L::uuid, 1, ''timeout_pre_start'', ''boom'')',
		pg_temp.id('e4', 31), pg_temp.id('e5', 31), pg_temp.id('e7', 31)
	));
	PERFORM pg_temp.assert_true(
		v_receipt @> '{"outcome":"finalize_failed","failure_code":"timeout_pre_start","execution_may_retry":false}',
		'a reserved-only effect was reported as uncertain or allowed a replay: ' || v_receipt::text
	);
	-- The live worker's own completed finalize also closes a leftover reserve.
	v_receipt := pg_temp.as_service(format(
		'SELECT public.finalize_agentic_chat_turn(%L::uuid, %L::uuid, %L::uuid, %L::uuid, 1, ''completed'', ''stop'', NULL, gen_random_uuid(), ''Done.'', ''{}''::jsonb, NULL, NULL, NULL, ''{}''::jsonb, ''{}''::jsonb)',
		pg_temp.id('e4', 31), pg_temp.id('e1', 1), pg_temp.id('e5', 31), pg_temp.id('e7', 31)
	));
	PERFORM pg_temp.assert_true(
		v_receipt->>'outcome' = 'finalized'
			AND (SELECT state = 'cancelled' FROM public.chat_turn_effects WHERE id = pg_temp.id('e8', 4)),
		'a completed turn left a reserved effect open: ' || v_receipt::text
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- Stop: signal a live worker, finalize a silent one
-- ---------------------------------------------------------------------------

-- 40: live lease; 41: stale lease with text and a started effect;
-- 42: expired lease; 43: unleased (pre-lease worker) with a 100 s heartbeat.
SELECT pg_temp.seed_turn(40, 'running', 'processing', 1, true, interval '10 seconds', interval '10 seconds', 'Live text');
SELECT pg_temp.seed_turn(41, 'running', 'processing', 1, true, interval '50 seconds', interval '10 seconds', 'Stale text');
SELECT pg_temp.seed_effect(41, 5, true);
SELECT pg_temp.seed_turn(42, 'running', 'processing', 1, false, interval '200 seconds', interval '10 seconds');
SELECT pg_temp.seed_turn(43, 'running', 'processing', 1, true, NULL, interval '100 seconds');

DO $$
DECLARE
	v_receipt jsonb;
BEGIN
	v_receipt := pg_temp.as_service(format(
		'SELECT public.request_agentic_chat_turn_cancel(%L::uuid, %L::uuid, ''user_cancelled'', ''browser'')',
		pg_temp.id('e4', 40), pg_temp.id('e1', 1)
	));
	PERFORM pg_temp.assert_true(
		v_receipt->>'outcome' = 'cancel_requested'
			AND (SELECT status = 'running' AND cancel_requested_at IS NOT NULL
				FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 40))
			AND EXISTS (SELECT 1 FROM public.chat_turn_signals WHERE turn_run_id = pg_temp.id('e4', 40)),
		'Stop on a live worker did not just signal it: ' || v_receipt::text
	);

	v_receipt := pg_temp.as_service(format(
		'SELECT public.request_agentic_chat_turn_cancel(%L::uuid, %L::uuid, ''user_cancelled'', ''browser'')',
		pg_temp.id('e4', 41), pg_temp.id('e1', 1)
	));
	PERFORM pg_temp.assert_true(
		v_receipt->>'outcome' = 'cancelled'
			AND v_receipt->>'status' = 'cancelled'
			AND (v_receipt->>'stopped_without_worker')::boolean
			AND v_receipt->>'turn_run_id' = pg_temp.id('e4', 41)::text
			AND v_receipt->>'user_id' = pg_temp.id('e1', 1)::text
			AND (v_receipt->>'execution_generation')::integer = 1
			AND v_receipt->>'terminal_event_id' = pg_temp.id('e4', 41)::text || ':1:'
				|| (v_receipt->>'terminal_sequence_index')
			AND (v_receipt->>'uncertain_effect_count')::integer = 1
			AND v_receipt->>'failure_code' = 'uncertain_external_commit',
		'Stop on a stale worker did not finalize (as may-have-happened): ' || v_receipt::text
	);
	PERFORM pg_temp.assert_true(
		(SELECT content = 'Stale text' FROM public.chat_messages WHERE id = (
			SELECT assistant_message_id FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 41)))
		AND (SELECT state = 'uncertain' FROM public.chat_turn_effects WHERE id = pg_temp.id('e8', 5))
		AND (SELECT status = 'cancelled' AND processing_token IS NULL
			FROM public.queue_jobs WHERE id = pg_temp.id('e5', 41))
		AND EXISTS (SELECT 1 FROM public.chat_turn_events
			WHERE turn_run_id = pg_temp.id('e4', 41) AND event_type = 'done'
				AND payload @> '{"status":"cancelled","recovery_trigger":"stop"}'),
		'Stop on a stale worker left text, effects, queue row, or event wrong'
	);

	-- Even a never-started turn is stopped, not retried.
	v_receipt := pg_temp.as_service(format(
		'SELECT public.request_agentic_chat_turn_cancel(%L::uuid, %L::uuid, ''user_cancelled'', ''browser'')',
		pg_temp.id('e4', 42), pg_temp.id('e1', 1)
	));
	PERFORM pg_temp.assert_true(
		v_receipt @> '{"outcome":"cancelled","status":"cancelled"}'
			AND v_receipt->>'assistant_message_id' IS NULL,
		'Stop on an expired pre-start turn did not finalize: ' || v_receipt::text
	);

	-- A pre-lease worker keeps the old guarantee: signal only.
	v_receipt := pg_temp.as_service(format(
		'SELECT public.request_agentic_chat_turn_cancel(%L::uuid, %L::uuid, ''user_cancelled'', ''browser'')',
		pg_temp.id('e4', 43), pg_temp.id('e1', 1)
	));
	PERFORM pg_temp.assert_true(
		v_receipt->>'outcome' = 'cancel_requested',
		'Stop bypassed a pre-lease worker under the old rule: ' || v_receipt::text
	);

	-- Repeat Stop on a finalized turn resolves to its terminal.
	v_receipt := pg_temp.as_service(format(
		'SELECT public.request_agentic_chat_turn_cancel(%L::uuid, %L::uuid, ''user_cancelled'', ''browser'')',
		pg_temp.id('e4', 41), pg_temp.id('e1', 1)
	));
	PERFORM pg_temp.assert_true(
		v_receipt @> '{"outcome":"already_terminal","status":"cancelled"}',
		'a repeated Stop did not resolve to the terminal: ' || v_receipt::text
	);
END;
$$;

-- A Stop the live worker never honored is finished by recovery once stale.
UPDATE public.chat_turn_runs
SET worker_lease_renewed_at = clock_timestamp() - interval '50 seconds'
WHERE id = pg_temp.id('e4', 40);
-- (Separate statements: a statement never sees its own function's writes.)
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, false);
BEGIN
	PERFORM pg_temp.assert_true(
		pg_temp.result_for(v_report, 40)->>'outcome' = 'finalized'
			AND (SELECT status = 'cancelled' FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 40)),
		'recovery did not finish a stale turn with a pending Stop: ' || v_report::text
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- Workflow turns: requeue, defer to a live worker, hand off, abandon
-- ---------------------------------------------------------------------------

INSERT INTO public.users (id) VALUES ('c1000000-0000-4000-8000-000000000001');
INSERT INTO auth.users (id) VALUES ('c1000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_actors (id, kind, name, user_id) VALUES
	('c2000000-0000-4000-8000-000000000001', 'human', 'Owner', 'c1000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_projects (id, name, created_by) VALUES
	('c3000000-0000-4000-8000-000000000001', 'Cedar House', 'c2000000-0000-4000-8000-000000000001');

CREATE OR REPLACE FUNCTION pg_temp.admit_workflow(p_n integer, p_message text)
RETURNS jsonb LANGUAGE sql AS $$
	SELECT public.create_agentic_chat_workflow_turn_with_job_v1(
		'c1000000-0000-4000-8000-000000000001', NULL,
		pg_temp.id('c4', p_n), pg_temp.id('c5', p_n), pg_temp.id('c6', p_n),
		'stream-wf-' || p_n, 'client-wf-' || p_n, pg_temp.id('c7', p_n), pg_temp.id('c8', p_n),
		'c3000000-0000-4000-8000-000000000001', p_message,
		public.agentic_chat_workflow_review_intent_v1(p_message),
		public.agentic_chat_workflow_policy_v1(), 'policy-ref-1',
		public.agentic_chat_workflow_request_hash_v1(jsonb_build_object(
			'clientTurnId', 'client-wf-' || p_n,
			'streamRunId', 'stream-wf-' || p_n,
			'context', jsonb_build_object('type', 'project',
				'entityId', 'c3000000-0000-4000-8000-000000000001',
				'projectId', 'c3000000-0000-4000-8000-000000000001'),
			'message', p_message,
			'reviewIntent', public.agentic_chat_workflow_review_intent_v1(p_message),
			'policy', public.agentic_chat_workflow_policy_v1(),
			'policyRef', 'policy-ref-1'
		))
	)
$$;

-- Admit, lease, claim, and begin one workflow turn; then age its lease.
CREATE OR REPLACE FUNCTION pg_temp.run_workflow(p_n integer, p_deadline_passed boolean, p_lease_age interval)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
	v_job uuid;
BEGIN
	PERFORM pg_temp.as_service(format('SELECT pg_temp.admit_workflow(%s, %L)', p_n, 'Workflow probe ' || p_n || '?'));
	SELECT queue_job_id INTO v_job FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', p_n);
	UPDATE public.queue_jobs
	SET status = 'processing', processing_token = pg_temp.id('c9', p_n), started_at = clock_timestamp()
	WHERE id = v_job;
	PERFORM pg_temp.as_service(format('SELECT public.claim_agentic_chat_turn(%L::uuid, %L::uuid, %L::uuid)',
		pg_temp.id('c4', p_n), v_job, pg_temp.id('c9', p_n)));
	PERFORM pg_temp.as_service(format('SELECT public.begin_agentic_chat_turn_execution(%L::uuid, %L::uuid, %L::uuid, 1)',
		pg_temp.id('c4', p_n), v_job, pg_temp.id('c9', p_n)));
	IF p_deadline_passed THEN
		UPDATE public.chat_turn_runs turns
		SET worker_started_at = runs.created_at - interval '900 seconds' + interval '1 millisecond'
		FROM public.chat_turn_workflow_runs runs
		WHERE turns.id = pg_temp.id('c4', p_n) AND runs.turn_run_id = turns.id;
		PERFORM pg_sleep(0.01);
	END IF;
	UPDATE public.chat_turn_runs
	SET worker_lease_generation = 1, worker_lease_renewed_at = clock_timestamp() - p_lease_age
	WHERE id = pg_temp.id('c4', p_n);
END;
$$;

SELECT pg_temp.run_workflow(1, false, interval '100 seconds');
SELECT pg_temp.run_workflow(2, true, interval '100 seconds');
SELECT pg_temp.run_workflow(3, true, interval '100 seconds');

DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, false);
	v_by_turn jsonb;
BEGIN
	SELECT jsonb_object_agg(result->>'turn_run_id', result->>'outcome') INTO v_by_turn
	FROM jsonb_array_elements(v_report->'results') result;
	PERFORM pg_temp.assert_true(
		v_by_turn->>(pg_temp.id('c4', 1)::text) = 'requeued'
			AND v_by_turn->>(pg_temp.id('c4', 2)::text) = 'workflow_deferred'
			AND v_by_turn->>(pg_temp.id('c4', 3)::text) = 'workflow_deferred'
			AND jsonb_array_length(v_report->'handoffs') = 0,
		'cron-mode workflow recovery is wrong: ' || v_report::text
	);
	PERFORM pg_temp.assert_true(
		(SELECT status = 'queued' FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 1))
		AND (SELECT status = 'running' FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 2)),
		'workflow requeue or deferral changed the wrong turn'
	);
END;
$$;

-- A live worker's sweep takes the deferred run: the token rotates (fencing the
-- old owner), the lease is NOT refreshed, and only the handoff carries the token.
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, true);
	v_handoff jsonb;
	v_new_token uuid;
	v_claim jsonb;
BEGIN
	PERFORM pg_temp.assert_true(
		(v_report->>'handoff_count')::integer = 2
			AND jsonb_array_length(v_report->'handoffs') = 2
			AND position('processing_token' IN (v_report->'results')::text) = 0,
		'worker-mode workflow recovery did not hand off: ' || v_report::text
	);
	SELECT handoff INTO v_handoff
	FROM jsonb_array_elements(v_report->'handoffs') handoff
	WHERE handoff->>'turn_run_id' = pg_temp.id('c4', 2)::text;
	v_new_token := (v_handoff->>'processing_token')::uuid;
	PERFORM pg_temp.assert_true(
		v_handoff->>'workflow_outcome' = 'deadline_expired'
			AND v_new_token <> pg_temp.id('c9', 2)
			AND v_handoff->>'correlation_id' = pg_temp.id('c8', 2)::text
			AND (SELECT processing_token = v_new_token FROM public.queue_jobs
				WHERE id = (v_handoff->>'queue_job_id')::uuid)
			AND (SELECT worker_lease_renewed_at < clock_timestamp() - interval '90 seconds'
				FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 2)),
		'the handoff did not rotate the token, or refreshed the lease: ' || v_handoff::text
	);
	PERFORM pg_temp.assert_true(
		pg_temp.as_service(format(
			'SELECT public.renew_agentic_chat_turn_lease(%L::uuid, %L::uuid, %L::uuid, 1)',
			pg_temp.id('c4', 2), v_handoff->>'queue_job_id', pg_temp.id('c9', 2)
		)) @> '{"outcome":"lost","reason":"ownership_lost"}',
		'the old workflow owner renewed after the handoff'
	);
	v_claim := pg_temp.as_service(format(
		'SELECT public.claim_agentic_chat_turn(%L::uuid, %L::uuid, %L::uuid)',
		pg_temp.id('c4', 2), v_handoff->>'queue_job_id', v_new_token
	));
	PERFORM pg_temp.assert_true(
		v_claim @> '{"outcome":"matching_current_claim","execution_generation":1}',
		'the handoff token cannot drive the worker convergence: ' || v_claim::text
	);
END;
$$;

-- The handoff did not converge (the worker never wrote): the cron still only
-- defers, a later worker sweep hands it off again, and once the run is
-- abandoned even a worker sweep ends it in SQL, so handoffs cannot loop.
DO $$
DECLARE
	v_report jsonb;
	v_token uuid;
BEGIN
	SELECT jobs.processing_token INTO v_token
	FROM public.queue_jobs jobs JOIN public.chat_turn_runs turns ON turns.queue_job_id = jobs.id
	WHERE turns.id = pg_temp.id('c4', 2);
	v_report := pg_temp.recover(100, false);
	PERFORM pg_temp.assert_true(
		pg_temp.result_for_turn(v_report, pg_temp.id('c4', 2))->>'outcome' = 'workflow_deferred'
			AND (SELECT jobs.processing_token = v_token
				FROM public.queue_jobs jobs JOIN public.chat_turn_runs turns ON turns.queue_job_id = jobs.id
				WHERE turns.id = pg_temp.id('c4', 2)),
		'cron-mode recovery changed a handed-off workflow turn: ' || v_report::text
	);
	v_report := pg_temp.recover(100, true);
	PERFORM pg_temp.assert_true(
		pg_temp.result_for_turn(v_report, pg_temp.id('c4', 2))->>'outcome' = 'workflow_handoff'
			AND (SELECT jobs.processing_token <> v_token
				FROM public.queue_jobs jobs JOIN public.chat_turn_runs turns ON turns.queue_job_id = jobs.id
				WHERE turns.id = pg_temp.id('c4', 2)),
		'an unconverged handoff was not handed off again: ' || v_report::text
	);
END;
$$;
UPDATE public.chat_turn_runs
SET worker_lease_renewed_at = clock_timestamp() - interval '200 seconds'
WHERE id = pg_temp.id('c4', 2);
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, true);
BEGIN
	PERFORM pg_temp.assert_true(
		pg_temp.result_for_turn(v_report, pg_temp.id('c4', 2))->>'outcome' = 'finalized'
			AND NOT (v_report->'handoffs' @> jsonb_build_array(jsonb_build_object(
				'turn_run_id', pg_temp.id('c4', 2))))
			AND (SELECT status = 'failed' AND failure_code = 'workflow_deadline_expired'
				FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 2)),
		'an abandoned workflow turn was handed off again instead of ended: ' || v_report::text
	);
END;
$$;

-- Nobody took run 3 over for a further lease period: the cron ends it itself.
UPDATE public.chat_turn_runs
SET worker_lease_renewed_at = clock_timestamp() - interval '200 seconds'
WHERE id = pg_temp.id('c4', 3);
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, false);
BEGIN
	PERFORM pg_temp.assert_true(
		v_report->'results'->0->>'outcome' = 'finalized'
			AND (SELECT status = 'failed' AND failure_code = 'workflow_deadline_expired'
				AND finished_reason = 'worker_interrupted'
				FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 3))
			AND (SELECT phase = 'finished' AND terminal_outcome = 'failed'
				FROM public.chat_turn_workflow_runs WHERE turn_run_id = pg_temp.id('c4', 3)),
		'an abandoned workflow turn was not ended generically: ' || v_report::text
	);
END;
$$;

-- Stop on a workflow turn whose worker went quiet: the cancel stays pending
-- (the cron may not render workflow truth), a live worker's sweep takes it
-- over as cancelled, and only an abandoned run is cancelled generically.
SELECT pg_temp.run_workflow(4, false, interval '50 seconds');
DO $$
DECLARE
	v_cancel jsonb;
	v_report jsonb;
	v_handoff jsonb;
BEGIN
	v_cancel := pg_temp.as_service(format(
		'SELECT public.request_agentic_chat_turn_cancel(%L::uuid, %L::uuid, ''user_cancelled'', ''browser'')',
		pg_temp.id('c4', 4), 'c1000000-0000-4000-8000-000000000001'
	));
	PERFORM pg_temp.assert_true(
		v_cancel->>'outcome' = 'cancel_requested'
			AND (SELECT status = 'running' FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 4)),
		'Stop finalized a workflow turn without workflow truth: ' || v_cancel::text
	);
	v_report := pg_temp.recover(100, false);
	PERFORM pg_temp.assert_true(
		v_report @> jsonb_build_object('results', jsonb_build_array(jsonb_build_object(
			'turn_run_id', pg_temp.id('c4', 4), 'outcome', 'workflow_deferred'))),
		'cron-mode recovery did not defer a stopped workflow turn: ' || v_report::text
	);
	v_report := pg_temp.recover(100, true);
	SELECT handoff INTO v_handoff
	FROM jsonb_array_elements(v_report->'handoffs') handoff
	WHERE handoff->>'turn_run_id' = pg_temp.id('c4', 4)::text;
	PERFORM pg_temp.assert_true(
		v_handoff->>'workflow_outcome' = 'cancel_requested',
		'a live worker was not handed the stopped workflow turn: ' || v_report::text
	);
END;
$$;
UPDATE public.chat_turn_runs
SET worker_lease_renewed_at = clock_timestamp() - interval '200 seconds'
WHERE id = pg_temp.id('c4', 4);
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, false);
BEGIN
	PERFORM pg_temp.assert_true(
		v_report @> jsonb_build_object('results', jsonb_build_array(jsonb_build_object(
			'turn_run_id', pg_temp.id('c4', 4), 'outcome', 'finalized')))
			AND (SELECT status = 'cancelled' AND failure_code = 'cancelled'
				FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 4))
			AND (SELECT terminal_outcome = 'cancelled'
				FROM public.chat_turn_workflow_runs WHERE turn_run_id = pg_temp.id('c4', 4)),
		'an abandoned stopped workflow turn was not cancelled: ' || v_report::text
	);
END;
$$;

-- A pre-lease workflow turn (no lease, 500 s of heartbeat silence): the
-- handoff's token rotation bumps the heartbeat, so the turn is pinned to a
-- lease dated at its real silence and the next sweep ends it in SQL.
SELECT pg_temp.run_workflow(5, true, interval '10 seconds');
UPDATE public.chat_turn_runs
SET worker_lease_generation = NULL, worker_lease_renewed_at = NULL
WHERE id = pg_temp.id('c4', 5);
SET session_replication_role = replica;
UPDATE public.queue_jobs jobs SET updated_at = clock_timestamp() - interval '500 seconds'
FROM public.chat_turn_runs turns
WHERE turns.id = pg_temp.id('c4', 5) AND jobs.id = turns.queue_job_id;
SET session_replication_role = origin;
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, true);
BEGIN
	PERFORM pg_temp.assert_true(
		pg_temp.result_for_turn(v_report, pg_temp.id('c4', 5))->>'outcome' = 'workflow_handoff'
			AND (SELECT worker_lease_generation = 1
				AND worker_lease_renewed_at < clock_timestamp() - interval '400 seconds'
				FROM public.chat_turn_runs WHERE id = pg_temp.id('c4', 5)),
		'a pre-lease workflow handoff was not pinned to its real silence: ' || v_report::text
	);
END;
$$;
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, true);
BEGIN
	PERFORM pg_temp.assert_true(
		pg_temp.result_for_turn(v_report, pg_temp.id('c4', 5))->>'outcome' = 'finalized',
		'a pre-lease workflow turn kept being handed off: ' || v_report::text
	);
END;
$$;

-- ---------------------------------------------------------------------------
-- Poison turns cannot starve recovery; orphans, liveness, and the reaper clock
-- ---------------------------------------------------------------------------

-- 50-53: always fail (their queue row names another correlation), and have been
-- silent longest. 54: a healthy dead turn, silent for less time.
SELECT pg_temp.seed_turn(n, 'running', 'processing', 1, true, interval '300 seconds', interval '10 seconds')
FROM generate_series(50, 53) n;
UPDATE public.queue_jobs
SET metadata = metadata || jsonb_build_object('correlationId', gen_random_uuid())
WHERE id IN (SELECT pg_temp.id('e5', n) FROM generate_series(50, 53) n);
SELECT pg_temp.seed_turn(54, 'running', 'processing', 1, true, interval '100 seconds', interval '10 seconds', 'Healthy');

DO $$
DECLARE
	v_report jsonb := pg_temp.recover(3, false);
BEGIN
	PERFORM pg_temp.assert_true(
		(v_report->>'failed_count')::integer = 3
			AND pg_temp.result_for(v_report, 54) IS NULL
			AND (SELECT count(*) FROM public.chat_turn_recovery_failures
				WHERE turn_run_id IN (SELECT pg_temp.id('e4', n) FROM generate_series(50, 53) n)) = 3,
		'the oldest poison turns were not tried and recorded: ' || v_report::text
	);
	-- Recorded failures are backed off: the next sweep reaches the healthy turn.
	v_report := pg_temp.recover(3, false);
	PERFORM pg_temp.assert_true(
		pg_temp.result_for(v_report, 54)->>'outcome' = 'finalized'
			AND pg_temp.result_for(v_report, 50) IS NULL,
		'a backed-off poison turn still starved the healthy one: ' || v_report::text
	);
END;
$$;

-- Once their back-off has passed, failing turns sort after healthy ones.
SELECT pg_temp.seed_turn(55, 'running', 'processing', 1, true, interval '95 seconds', interval '10 seconds');
UPDATE public.chat_turn_recovery_failures
SET last_failed_at = clock_timestamp() - interval '1 hour';
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(1, false);
BEGIN
	PERFORM pg_temp.assert_true(
		pg_temp.result_for(v_report, 55)->>'outcome' = 'finalized',
		'a failing turn was sorted before a healthy dead turn: ' || v_report::text
	);
END;
$$;

-- Bare mode: a turn whose durable projection is too large to finalize is
-- ended without it from the third failure on.
SELECT pg_temp.seed_turn(56, 'running', 'processing', 1, true, interval '100 seconds', interval '10 seconds', 'Lost text');
UPDATE public.chat_turn_stream_state
SET projection = projection || jsonb_build_object('oversized', repeat('x', 600000))
WHERE turn_run_id = pg_temp.id('e4', 56);
DELETE FROM public.chat_turn_recovery_failures;
DO $$
DECLARE
	v_report jsonb;
BEGIN
	v_report := pg_temp.recover(100, false);
	PERFORM pg_temp.assert_true(
		pg_temp.result_for(v_report, 56)->>'outcome' = 'failed',
		'the poison projection did not fail normal recovery: ' || v_report::text
	);
	UPDATE public.chat_turn_recovery_failures
	SET failure_count = 3, last_failed_at = clock_timestamp() - interval '1 hour'
	WHERE turn_run_id = pg_temp.id('e4', 56);
END;
$$;
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, false);
BEGIN
	PERFORM pg_temp.assert_true(
		pg_temp.result_for(v_report, 56)->>'outcome' = 'finalized'
			AND (SELECT status = 'failed' AND failure_code = 'recovery_failed'
				FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 56))
			AND NOT EXISTS (SELECT 1 FROM public.chat_turn_recovery_failures
				WHERE turn_run_id = pg_temp.id('e4', 56)),
		'bare mode did not end the poison turn and clear its ledger: ' || v_report::text
	);
END;
$$;

-- Parked after eight failures: never tried again, reported every sweep.
UPDATE public.chat_turn_recovery_failures
SET failure_count = 8, last_failed_at = clock_timestamp() - interval '1 hour'
WHERE turn_run_id = pg_temp.id('e4', 50);
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, false);
BEGIN
	PERFORM pg_temp.assert_true(
		(v_report->>'parked_count')::integer = 1 AND pg_temp.result_for(v_report, 50) IS NULL,
		'a parked turn was retried or not reported: ' || v_report::text
	);
END;
$$;

-- Orphans: running turns whose queue row no worker holds. 60: row failed and
-- tokenless, silent 100 s. 61: row completed, lease fresh (not yet). 62: row
-- processing without a token, a Stop pending and a started effect.
SELECT pg_temp.seed_turn(60, 'running', 'failed', 1, true, interval '100 seconds', interval '100 seconds', 'Orphan text');
SELECT pg_temp.seed_turn(61, 'running', 'completed', 1, true, interval '30 seconds', interval '100 seconds');
SELECT pg_temp.seed_turn(62, 'running', 'processing', 1, true, interval '100 seconds', interval '100 seconds', '', true);
UPDATE public.queue_jobs SET processing_token = NULL WHERE id = pg_temp.id('e5', 62);
SELECT pg_temp.seed_effect(62, 62, true);
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, false);
BEGIN
	PERFORM pg_temp.assert_true(
		pg_temp.result_for(v_report, 60)->>'outcome' = 'finalized'
			AND pg_temp.result_for(v_report, 61) IS NULL
			AND pg_temp.result_for(v_report, 62)->>'outcome' = 'finalized'
			AND (SELECT status = 'failed' AND failure_code = 'queue_orphaned'
				FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 60))
			AND (SELECT status = 'failed' AND processing_token IS NULL
				FROM public.queue_jobs WHERE id = pg_temp.id('e5', 60))
			AND (SELECT status = 'cancelled' AND failure_code = 'uncertain_external_commit'
				FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 62))
			AND (SELECT status = 'cancelled' AND processing_token IS NULL
				FROM public.queue_jobs WHERE id = pg_temp.id('e5', 62))
			AND (SELECT state = 'uncertain' FROM public.chat_turn_effects WHERE id = pg_temp.id('e8', 62)),
		'orphaned running turns were not ended safely: ' || v_report::text
	);
	PERFORM pg_temp.assert_true(
		(SELECT status = 'running' FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 61)),
		'an orphan with a fresh lease was ended early'
	);
END;
$$;

-- The finalize primitive re-proves liveness: no caller can end a live turn.
SELECT pg_temp.seed_turn(63, 'running', 'processing', 1, true, interval '10 seconds', interval '10 seconds');
DO $$
BEGIN
	PERFORM pg_temp.assert_true(
		pg_temp.expect_error(
			format('SELECT pg_temp.as_service(%L)', format(
				'SELECT public.agentic_chat_finalize_dead_turn_v1(%L::uuid, ''failed'', ''x'', ''lease_expired'')',
				pg_temp.id('e4', 63)
			)),
			'agentic_chat_dead_turn_worker_alive'
		)
		AND (SELECT status = 'running' FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 63)),
		'the dead-turn finalize ended a turn with a live lease'
	);
END;
$$;

-- The queued reaper times a recovery requeue from the requeue, not admission.
SELECT pg_temp.seed_turn(64, 'running', 'processing', 1, false, interval '100 seconds', interval '10 seconds');
DO $$
DECLARE
	v_report jsonb := pg_temp.recover(100, false);
	v_reaped jsonb;
BEGIN
	PERFORM pg_temp.assert_true(
		pg_temp.result_for(v_report, 64)->>'outcome' = 'requeued',
		'the pre-start turn was not requeued: ' || v_report::text
	);
	v_reaped := pg_temp.as_service('SELECT public.reap_stranded_queued_agentic_chat_turns(300, 500)');
	PERFORM pg_temp.assert_true(
		(SELECT status = 'queued' FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 64)),
		'the reaper cancelled a fresh recovery requeue of an old turn: ' || v_reaped::text
	);
END;
$$;
SET session_replication_role = replica;
UPDATE public.queue_jobs SET updated_at = clock_timestamp() - interval '6 minutes'
WHERE id = pg_temp.id('e5', 64);
SET session_replication_role = origin;
DO $$
BEGIN
	PERFORM pg_temp.as_service('SELECT public.reap_stranded_queued_agentic_chat_turns(300, 500)');
	PERFORM pg_temp.assert_true(
		(SELECT status = 'cancelled' FROM public.chat_turn_runs WHERE id = pg_temp.id('e4', 64)),
		'the reaper never timed out a requeue left waiting past its cutoff'
	);
END;
$$;

SELECT 'agentic_chat_turn_leases_ok' AS result;
