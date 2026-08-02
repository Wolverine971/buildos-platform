-- supabase/tests/20260801041100_agentic_chat_worker_effect_rpcs.test.sql
-- Disposable PostgreSQL verification for Agentic Chat Phase 2B Slice 2.
-- Prerequisite: apply 20260801041100_agentic_chat_worker_effect_rpcs.sql.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. This fixture commits rows so two dblink
-- connections can prove single-winner begin behavior; never run it against a
-- linked, staging, or production database.

\set ON_ERROR_STOP on

CREATE EXTENSION IF NOT EXISTS dblink;

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

DO $$
DECLARE
	v_reserve regprocedure := to_regprocedure(
		'public.reserve_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text,text,boolean,text)'
	);
	v_begin regprocedure := to_regprocedure(
		'public.begin_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text)'
	);
	v_reconcile regprocedure := to_regprocedure(
		'public.reconcile_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text,jsonb,text)'
	);
BEGIN
	PERFORM pg_temp.assert_true(
		v_reserve IS NOT NULL AND v_begin IS NOT NULL AND v_reconcile IS NOT NULL,
		'effect RPC package is incomplete'
	);
	PERFORM pg_temp.assert_true(
		NOT has_function_privilege('anon', v_reserve, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_reserve, 'EXECUTE')
			AND has_function_privilege('service_role', v_reserve, 'EXECUTE')
			AND NOT has_function_privilege('anon', v_begin, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_begin, 'EXECUTE')
			AND has_function_privilege('service_role', v_begin, 'EXECUTE')
			AND NOT has_function_privilege('anon', v_reconcile, 'EXECUTE')
			AND NOT has_function_privilege('authenticated', v_reconcile, 'EXECUTE')
			AND has_function_privilege('service_role', v_reconcile, 'EXECUTE'),
		'effect RPC grants are not service-only'
	);
END;
$$;

INSERT INTO public.users (id)
VALUES ('c1000000-0000-4000-8000-000000000001');

INSERT INTO public.chat_sessions (id, user_id, context_type, status)
VALUES
	('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'project', 'active'),
	('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'project', 'active'),
	('c2000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'project', 'active'),
	('c2000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'project', 'active'),
	('c2000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000001', 'project', 'active'),
	('c2000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000001', 'project', 'active');

INSERT INTO public.queue_jobs (
	id, user_id, job_type, metadata, status, processing_token, queue_job_id
)
VALUES
	(
		'c3000000-0000-4000-8000-000000000001',
		'c1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', 'c5000000-0000-4000-8000-000000000001',
			'correlationId', 'c7000000-0000-4000-8000-000000000001'
		),
		'processing',
		'c4000000-0000-4000-8000-000000000001',
		'agentic_chat_turn_effect_1'
	),
	(
		'c3000000-0000-4000-8000-000000000002',
		'c1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', 'c5000000-0000-4000-8000-000000000002',
			'correlationId', 'c7000000-0000-4000-8000-000000000002'
		),
		'processing',
		'c4000000-0000-4000-8000-000000000002',
		'agentic_chat_turn_effect_2'
	),
	(
		'c3000000-0000-4000-8000-000000000003',
		'c1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', 'c5000000-0000-4000-8000-000000000003',
			'correlationId', 'c7000000-0000-4000-8000-000000000003'
		),
		'processing',
		'c4000000-0000-4000-8000-000000000003',
		'agentic_chat_turn_effect_3'
	),
	(
		'c3000000-0000-4000-8000-000000000004',
		'c1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', 'c5000000-0000-4000-8000-000000000004',
			'correlationId', 'c7000000-0000-4000-8000-000000000004'
		),
		'processing',
		'c4000000-0000-4000-8000-000000000004',
		'agentic_chat_turn_effect_4'
	),
	(
		'c3000000-0000-4000-8000-000000000005',
		'c1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', 'c5000000-0000-4000-8000-000000000099',
			'correlationId', 'c7000000-0000-4000-8000-000000000005'
		),
		'processing',
		'c4000000-0000-4000-8000-000000000005',
		'agentic_chat_turn_effect_5'
	),
	(
		'c3000000-0000-4000-8000-000000000006',
		'c1000000-0000-4000-8000-000000000001',
		'agentic_chat_turn',
		jsonb_build_object(
			'turnRunId', 'c5000000-0000-4000-8000-000000000006',
			'correlationId', 'c7000000-0000-4000-8000-000000000006'
		),
		'processing',
		'c4000000-0000-4000-8000-000000000006',
		'agentic_chat_turn_effect_6'
	);

INSERT INTO public.chat_turn_runs (
	id,
	session_id,
	user_id,
	stream_run_id,
	client_turn_id,
	context_type,
	request_message,
	status,
	execution_mode,
	execution_generation,
	queue_job_id,
	correlation_id,
	execution_started_at
)
VALUES
	(
		'c5000000-0000-4000-8000-000000000001',
		'c2000000-0000-4000-8000-000000000001',
		'c1000000-0000-4000-8000-000000000001',
		'phase2b-effect-rpc-stream-1',
		'phase2b-effect-rpc-client-1',
		'project',
		'mutate one',
		'running',
		'worker_realtime',
		1,
		'c3000000-0000-4000-8000-000000000001',
		'c7000000-0000-4000-8000-000000000001',
		clock_timestamp()
	),
	(
		'c5000000-0000-4000-8000-000000000002',
		'c2000000-0000-4000-8000-000000000002',
		'c1000000-0000-4000-8000-000000000001',
		'phase2b-effect-rpc-stream-2',
		'phase2b-effect-rpc-client-2',
		'project',
		'mutate two',
		'running',
		'worker_realtime',
		1,
		'c3000000-0000-4000-8000-000000000002',
		'c7000000-0000-4000-8000-000000000002',
		clock_timestamp()
	),
	(
		'c5000000-0000-4000-8000-000000000003',
		'c2000000-0000-4000-8000-000000000003',
		'c1000000-0000-4000-8000-000000000001',
		'phase2b-effect-rpc-stream-3',
		'phase2b-effect-rpc-client-3',
		'project',
		'mutate three',
		'running',
		'worker_realtime',
		1,
		'c3000000-0000-4000-8000-000000000003',
		'c7000000-0000-4000-8000-000000000003',
		clock_timestamp()
	),
	(
		'c5000000-0000-4000-8000-000000000004',
		'c2000000-0000-4000-8000-000000000004',
		'c1000000-0000-4000-8000-000000000001',
		'phase2b-effect-rpc-stream-4',
		'phase2b-effect-rpc-client-4',
		'project',
		'mutate four',
		'running',
		'worker_realtime',
		1,
		'c3000000-0000-4000-8000-000000000004',
		'c7000000-0000-4000-8000-000000000004',
		clock_timestamp()
	),
	(
		'c5000000-0000-4000-8000-000000000005',
		'c2000000-0000-4000-8000-000000000005',
		'c1000000-0000-4000-8000-000000000001',
		'phase2b-effect-rpc-stream-5',
		'phase2b-effect-rpc-client-5',
		'project',
		'mutate five',
		'running',
		'worker_realtime',
		1,
		'c3000000-0000-4000-8000-000000000005',
		'c7000000-0000-4000-8000-000000000005',
		clock_timestamp()
	),
	(
		'c5000000-0000-4000-8000-000000000006',
		'c2000000-0000-4000-8000-000000000006',
		'c1000000-0000-4000-8000-000000000001',
		'phase2b-effect-rpc-stream-6',
		'phase2b-effect-rpc-client-6',
		'project',
		'mutate six',
		'running',
		'worker_realtime',
		1,
		'c3000000-0000-4000-8000-000000000006',
		'c7000000-0000-4000-8000-000000000006',
		clock_timestamp()
	);

-- A user-callable definer wrapper must not be able to launder an authenticated
-- request into the service-only effect RPC.
CREATE OR REPLACE FUNCTION public.test_authenticated_effect_wrapper()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
	SELECT public.reserve_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000099',
		'c5000000-0000-4000-8000-000000000001',
		'c3000000-0000-4000-8000-000000000001',
		'c4000000-0000-4000-8000-000000000001',
		1,
		'task_update',
		'update_task',
		repeat('9', 64),
		true,
		'provider-wrapper'
	);
$$;
REVOKE ALL ON FUNCTION public.test_authenticated_effect_wrapper() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.test_authenticated_effect_wrapper() TO authenticated;

SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', false);
SET ROLE authenticated;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		'SELECT public.test_authenticated_effect_wrapper()',
		'agentic_chat_effect_service_role_required'
	),
	'authenticated definer wrapper bypassed the service-role assertion'
);
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);
DROP FUNCTION public.test_authenticated_effect_wrapper();

-- Reservation is durable and idempotent, but never authorizes invocation.
SET ROLE service_role;
SELECT pg_temp.assert_true(
	(
		public.reserve_agentic_chat_effect(
			'c6000000-0000-4000-8000-000000000001',
			'c5000000-0000-4000-8000-000000000001',
			'c3000000-0000-4000-8000-000000000001',
			'c4000000-0000-4000-8000-000000000001',
			1,
			' task_update ',
			' update_task ',
			repeat('a', 64),
			true,
			'provider-call-a'
		)->>'outcome'
	) = 'reserved',
	'first reservation did not create the stable effect'
);

SELECT pg_temp.assert_true(
	(
		SELECT effects.state = 'reserved'
			AND effects.provider_tool_call_id = 'provider-call-a'
			AND turns.mutation_reserved_at IS NOT NULL
			AND turns.irreversible_boundary_at IS NULL
		FROM public.chat_turn_effects effects
		JOIN public.chat_turn_runs turns ON turns.id = effects.turn_run_id
		WHERE effects.id = 'c6000000-0000-4000-8000-000000000001'
	),
	'reservation crossed the irreversible boundary or stored the wrong identity'
);

SELECT pg_temp.assert_true(
	(
		public.reserve_agentic_chat_effect(
			'c6000000-0000-4000-8000-000000000001',
			'c5000000-0000-4000-8000-000000000001',
			'c3000000-0000-4000-8000-000000000001',
			'c4000000-0000-4000-8000-000000000001',
			1,
			'task_update',
			'update_task',
			repeat('a', 64),
			true,
			'provider-call-retry-is-telemetry-only'
		)->>'outcome'
	) = 'existing'
	AND (
		SELECT count(*) = 1
		FROM public.chat_turn_effects
		WHERE id = 'c6000000-0000-4000-8000-000000000001'
	),
	'same effect/hash reservation did not resolve the existing record'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.reserve_agentic_chat_effect(
				'c6000000-0000-4000-8000-000000000001',
				'c5000000-0000-4000-8000-000000000001',
				'c3000000-0000-4000-8000-000000000001',
				'c4000000-0000-4000-8000-000000000001',
				1, 'task_update', 'update_task', repeat('b', 64), true, 'provider-call-a'
			)
		$test$,
		'agentic_chat_effect_idempotency_conflict'
	),
	'different canonical arguments reused an existing effect id'
);

SELECT pg_temp.assert_true(
	(
		public.begin_agentic_chat_effect(
			'c6000000-0000-4000-8000-000000000001',
			'c5000000-0000-4000-8000-000000000001',
			'c3000000-0000-4000-8000-000000000001',
			'c4000000-0000-4000-8000-000000000001',
			1,
			repeat('a', 64),
			'provider-call-b'
		)->>'invokeAdapter'
	)::boolean,
	'first begin winner was not authorized to invoke'
);

SELECT pg_temp.assert_true(
	(
		SELECT effects.state = 'started'
			AND effects.provider_tool_call_id = 'provider-call-b'
			AND effects.started_at IS NOT NULL
			AND turns.irreversible_boundary_at IS NOT NULL
		FROM public.chat_turn_effects effects
		JOIN public.chat_turn_runs turns ON turns.id = effects.turn_run_id
		WHERE effects.id = 'c6000000-0000-4000-8000-000000000001'
	),
	'begin did not atomically persist the started state and irreversible boundary'
);

SELECT pg_temp.assert_true(
	NOT (
		public.begin_agentic_chat_effect(
			'c6000000-0000-4000-8000-000000000001',
			'c5000000-0000-4000-8000-000000000001',
			'c3000000-0000-4000-8000-000000000001',
			'c4000000-0000-4000-8000-000000000001',
			1,
			repeat('a', 64),
			'provider-call-c'
		)->>'invokeAdapter'
	)::boolean,
	'duplicate begin was incorrectly authorized to invoke'
);

SELECT pg_temp.assert_true(
	(
		public.reconcile_agentic_chat_effect(
			'c6000000-0000-4000-8000-000000000001',
			'c5000000-0000-4000-8000-000000000001',
			'c3000000-0000-4000-8000-000000000001',
			'c4000000-0000-4000-8000-000000000001',
			1,
			repeat('a', 64),
			'succeeded',
			'{"taskId":"task-1"}'::jsonb,
			NULL
		)->>'state'
	) = 'succeeded',
	'started effect did not reconcile to succeeded'
);

SELECT pg_temp.assert_true(
	(
		public.reconcile_agentic_chat_effect(
			'c6000000-0000-4000-8000-000000000001',
			'c5000000-0000-4000-8000-000000000001',
			NULL,
			NULL,
			1,
			repeat('a', 64),
			'failed',
			NULL,
			'late_conflict_must_return_receipt'
		)->>'state'
	) = 'succeeded'
	AND (
		SELECT downstream_receipt = '{"taskId":"task-1"}'::jsonb
		FROM public.chat_turn_effects
		WHERE id = 'c6000000-0000-4000-8000-000000000001'
	),
	'terminal duplicate did not return the committed receipt'
);

RESET ROLE;
UPDATE public.chat_turn_runs
SET execution_generation = 2
WHERE id = 'c5000000-0000-4000-8000-000000000001';
UPDATE public.queue_jobs
SET processing_token = 'c4000000-0000-4000-8000-000000000011'
WHERE id = 'c3000000-0000-4000-8000-000000000001';
SET ROLE service_role;

SELECT pg_temp.assert_true(
	(public.reserve_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000001',
		'c5000000-0000-4000-8000-000000000001',
		NULL,
		NULL,
		2,
		'task_update',
		'update_task',
		repeat('a', 64),
		true,
		'provider-after-owner-loss'
	)->>'outcome') = 'existing'
	AND NOT (public.begin_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000001',
		'c5000000-0000-4000-8000-000000000001',
		NULL,
		NULL,
		2,
		repeat('a', 64),
		'provider-after-owner-loss'
	)->>'invokeAdapter')::boolean,
	'lost-response duplicate did not return the existing receipt after ownership loss'
);

-- Cancel between reserve and begin must leave the effect unstarted and the turn
-- short of the irreversible boundary.
SELECT pg_temp.assert_true(
	(public.reserve_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000002',
		'c5000000-0000-4000-8000-000000000002',
		'c3000000-0000-4000-8000-000000000002',
		'c4000000-0000-4000-8000-000000000002',
		1, 'task_update', 'update_task', repeat('c', 64), true, 'provider-cancel'
	)->>'state') = 'reserved',
	'cancel-race reservation failed'
);
RESET ROLE;

UPDATE public.chat_turn_runs
SET cancel_requested_at = clock_timestamp(), cancel_reason = 'user'
WHERE id = 'c5000000-0000-4000-8000-000000000002';

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.begin_agentic_chat_effect(
				'c6000000-0000-4000-8000-000000000002',
				'c5000000-0000-4000-8000-000000000002',
				'c3000000-0000-4000-8000-000000000002',
				'c4000000-0000-4000-8000-000000000002',
				1, repeat('c', 64), 'provider-cancel'
			)
		$test$,
		'agentic_chat_effect_cancel_already_accepted'
	),
	'begin crossed an accepted cancellation'
);

SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.reserve_agentic_chat_effect(
				'c6000000-0000-4000-8000-000000000022',
				'c5000000-0000-4000-8000-000000000002',
				'c3000000-0000-4000-8000-000000000002',
				'c4000000-0000-4000-8000-000000000002',
				1, 'task_update', 'update_task', repeat('2', 64), true, NULL
			)
		$test$,
		'agentic_chat_effect_cancel_already_accepted'
	),
	'new reservation crossed an accepted cancellation'
);

SELECT pg_temp.assert_true(
	(
		public.reconcile_agentic_chat_effect(
			'c6000000-0000-4000-8000-000000000002',
			'c5000000-0000-4000-8000-000000000002',
			NULL,
			NULL,
			1,
			repeat('c', 64),
			'cancelled',
			NULL,
			'cancelled_before_start'
		)->>'state'
	) = 'cancelled'
	AND (
		SELECT effects.started_at IS NULL
			AND turns.irreversible_boundary_at IS NULL
		FROM public.chat_turn_effects effects
		JOIN public.chat_turn_runs turns ON turns.id = effects.turn_run_id
		WHERE effects.id = 'c6000000-0000-4000-8000-000000000002'
	),
	'accepted cancellation did not safely abandon the unstarted effect'
);

-- Current-generation and processing-token fences both reject stale workers.
SELECT pg_temp.assert_true(
	(public.reserve_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000003',
		'c5000000-0000-4000-8000-000000000003',
		'c3000000-0000-4000-8000-000000000003',
		'c4000000-0000-4000-8000-000000000003',
		1, 'task_update', 'update_task', repeat('d', 64), true, 'provider-stale'
	)->>'state') = 'reserved',
	'stale-worker fixture reservation failed'
);
RESET ROLE;

UPDATE public.chat_turn_runs
SET execution_generation = 2
WHERE id = 'c5000000-0000-4000-8000-000000000003';
UPDATE public.queue_jobs
SET processing_token = 'c4000000-0000-4000-8000-000000000033'
WHERE id = 'c3000000-0000-4000-8000-000000000003';

SET ROLE service_role;
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.begin_agentic_chat_effect(
				'c6000000-0000-4000-8000-000000000003',
				'c5000000-0000-4000-8000-000000000003',
				'c3000000-0000-4000-8000-000000000003',
				'c4000000-0000-4000-8000-000000000003',
				1, repeat('d', 64), 'provider-stale'
			)
		$test$,
		'agentic_chat_effect_ownership_lost'
	),
	'stale generation/token began a reserved effect'
);

SELECT pg_temp.assert_true(
	(
		SELECT effects.state = 'reserved'
			AND turns.irreversible_boundary_at IS NULL
		FROM public.chat_turn_effects effects
		JOIN public.chat_turn_runs turns ON turns.id = effects.turn_run_id
		WHERE effects.id = 'c6000000-0000-4000-8000-000000000003'
	),
	'stale begin partially crossed the irreversible boundary'
);

SELECT pg_temp.assert_true(
	(public.begin_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000003',
		'c5000000-0000-4000-8000-000000000003',
		'c3000000-0000-4000-8000-000000000003',
		'c4000000-0000-4000-8000-000000000033',
		2,
		repeat('d', 64),
		'provider-current-generation'
	)->>'invokeAdapter')::boolean,
	'new current generation was not the begin winner for the stable reserved effect id'
);

SELECT pg_temp.assert_true(
	(
		SELECT effects.execution_generation = 1
			AND effects.state = 'started'
			AND turns.irreversible_boundary_at IS NOT NULL
		FROM public.chat_turn_effects effects
		JOIN public.chat_turn_runs turns ON turns.id = effects.turn_run_id
		WHERE effects.id = 'c6000000-0000-4000-8000-000000000003'
	),
	'cross-generation begin rewrote effect identity or missed the irreversible boundary'
);

SELECT pg_temp.assert_true(
	(public.reconcile_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000003',
		'c5000000-0000-4000-8000-000000000003',
		'c3000000-0000-4000-8000-000000000003',
		'c4000000-0000-4000-8000-000000000033',
		2,
		repeat('d', 64),
		'succeeded',
		'{"taskId":"generation-recovery"}'::jsonb,
		NULL
	)->>'state') = 'succeeded',
	'current generation could not reconcile an effect reserved by the prior generation'
);

-- Unsupported/queryless downstream outcomes become uncertain, never a second
-- invocation; a later service reconciliation can resolve that durable state by
-- effect id without needing the old queue token.
SELECT pg_temp.assert_true(
	(public.reserve_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000004',
		'c5000000-0000-4000-8000-000000000004',
		'c3000000-0000-4000-8000-000000000004',
		'c4000000-0000-4000-8000-000000000004',
		1, 'external_write', 'commit_external', repeat('e', 64), false, 'provider-unknown'
	)->>'state') = 'reserved',
	'uncertain fixture reservation failed'
);
SELECT pg_temp.assert_true(
	(public.begin_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000004',
		'c5000000-0000-4000-8000-000000000004',
		'c3000000-0000-4000-8000-000000000004',
		'c4000000-0000-4000-8000-000000000004',
		1, repeat('e', 64), 'provider-unknown'
	)->>'invokeAdapter')::boolean,
	'uncertain fixture did not begin'
);
SELECT pg_temp.assert_true(
	(public.reconcile_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000004',
		'c5000000-0000-4000-8000-000000000004',
		'c3000000-0000-4000-8000-000000000004',
		'c4000000-0000-4000-8000-000000000004',
		1, repeat('e', 64), 'uncertain', NULL, 'receipt_unknown'
	)->>'state') = 'uncertain',
	'queryless downstream did not become uncertain'
);
SELECT pg_temp.assert_true(
	NOT (public.begin_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000004',
		'c5000000-0000-4000-8000-000000000004',
		'c3000000-0000-4000-8000-000000000004',
		'c4000000-0000-4000-8000-000000000004',
		1, repeat('e', 64), 'provider-retry'
	)->>'invokeAdapter')::boolean,
	'uncertain effect was automatically authorized for another invocation'
);

RESET ROLE;
UPDATE public.chat_turn_runs
SET execution_generation = 2
WHERE id = 'c5000000-0000-4000-8000-000000000004';
UPDATE public.queue_jobs
SET processing_token = 'c4000000-0000-4000-8000-000000000044'
WHERE id = 'c3000000-0000-4000-8000-000000000004';
SET ROLE service_role;

SELECT pg_temp.assert_true(
	NOT (public.begin_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000004',
		'c5000000-0000-4000-8000-000000000004',
		NULL,
		NULL,
		2,
		repeat('e', 64),
		'provider-after-owner-loss'
	)->>'invokeAdapter')::boolean,
	'uncertain lost-response retry required or reacquired queue ownership'
);

SELECT pg_temp.assert_true(
	(public.reconcile_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000004',
		'c5000000-0000-4000-8000-000000000004',
		NULL,
		NULL,
		2,
		repeat('e', 64),
		'succeeded',
		'{"externalId":"external-1"}'::jsonb,
		NULL
	)->>'state') = 'succeeded',
	'explicit uncertain-effect reconciliation required stale queue ownership'
);

-- A queue id/token without its canonical metadata relationship is not owner.
SELECT pg_temp.assert_true(
	pg_temp.expect_error(
		$test$
			SELECT public.reserve_agentic_chat_effect(
				'c6000000-0000-4000-8000-000000000005',
				'c5000000-0000-4000-8000-000000000005',
				'c3000000-0000-4000-8000-000000000005',
				'c4000000-0000-4000-8000-000000000005',
				1, 'task_update', 'update_task', repeat('f', 64), true, NULL
			)
		$test$,
		'agentic_chat_effect_ownership_lost'
	),
	'forged queue metadata reserved an effect'
);

-- Prepare a genuine two-session race for reserved -> started. The trigger holds
-- the winning transaction after it owns the turn lock so the second connection
-- must contend with it instead of merely running later.
SELECT pg_temp.assert_true(
	(public.reserve_agentic_chat_effect(
		'c6000000-0000-4000-8000-000000000006',
		'c5000000-0000-4000-8000-000000000006',
		'c3000000-0000-4000-8000-000000000006',
		'c4000000-0000-4000-8000-000000000006',
		1, 'task_update', 'update_task', repeat('6', 64), true, 'provider-race'
	)->>'state') = 'reserved',
	'concurrent-begin fixture reservation failed'
);
RESET ROLE;

CREATE OR REPLACE FUNCTION public.test_pause_effect_begin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.id = 'c6000000-0000-4000-8000-000000000006'
		AND OLD.state = 'reserved'
		AND NEW.state = 'started' THEN
		PERFORM pg_sleep(0.5);
	END IF;
	RETURN NEW;
END;
$$;

CREATE TRIGGER test_pause_effect_begin
BEFORE UPDATE ON public.chat_turn_effects
FOR EACH ROW EXECUTE FUNCTION public.test_pause_effect_begin();

SELECT dblink_connect(
	'effect_begin_a',
	format(
		'dbname=%L host=%L port=%L',
		current_database(),
		current_setting('unix_socket_directories'),
		current_setting('port')
	)
);
SELECT dblink_connect(
	'effect_begin_b',
	format(
		'dbname=%L host=%L port=%L',
		current_database(),
		current_setting('unix_socket_directories'),
		current_setting('port')
	)
);

SELECT dblink_send_query(
	'effect_begin_a',
	$query_a$
		WITH trusted_request AS MATERIALIZED (
			SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
		)
		SELECT public.begin_agentic_chat_effect(
			'c6000000-0000-4000-8000-000000000006',
			'c5000000-0000-4000-8000-000000000006',
			'c3000000-0000-4000-8000-000000000006',
			'c4000000-0000-4000-8000-000000000006',
			1, repeat('6', 64), 'provider-race-a'
		)
		FROM trusted_request
	$query_a$
);
SELECT dblink_send_query(
	'effect_begin_b',
	$query_b$
		WITH trusted_request AS MATERIALIZED (
			SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)
		)
		SELECT public.begin_agentic_chat_effect(
			'c6000000-0000-4000-8000-000000000006',
			'c5000000-0000-4000-8000-000000000006',
			'c3000000-0000-4000-8000-000000000006',
			'c4000000-0000-4000-8000-000000000006',
			1, repeat('6', 64), 'provider-race-b'
		)
		FROM trusted_request
	$query_b$
);

CREATE TEMP TABLE concurrent_begin_results (result jsonb);
INSERT INTO concurrent_begin_results
SELECT result
FROM dblink_get_result('effect_begin_a', false) AS response(result jsonb);
INSERT INTO concurrent_begin_results
SELECT result
FROM dblink_get_result('effect_begin_b', false) AS response(result jsonb);

SELECT pg_temp.assert_true(
	(SELECT count(*) FROM concurrent_begin_results WHERE (result->>'invokeAdapter')::boolean) = 1
		AND (SELECT count(*) FROM concurrent_begin_results WHERE NOT (result->>'invokeAdapter')::boolean) = 1
		AND (SELECT count(*) FROM concurrent_begin_results WHERE result->>'outcome' = 'started') = 1
		AND (SELECT count(*) FROM concurrent_begin_results WHERE result->>'outcome' = 'existing') = 1,
	'concurrent begin did not produce exactly one invocation winner'
);
SELECT pg_temp.assert_true(
	(
		SELECT effects.state = 'started'
			AND effects.started_at IS NOT NULL
			AND turns.irreversible_boundary_at IS NOT NULL
		FROM public.chat_turn_effects effects
		JOIN public.chat_turn_runs turns ON turns.id = effects.turn_run_id
		WHERE effects.id = 'c6000000-0000-4000-8000-000000000006'
	),
	'concurrent begin did not leave one durable started effect/boundary'
);

SELECT dblink_disconnect('effect_begin_a');
SELECT dblink_disconnect('effect_begin_b');
DROP TRIGGER test_pause_effect_begin ON public.chat_turn_effects;
DROP FUNCTION public.test_pause_effect_begin();

-- Package rollback removes only these RPCs and leaves the Slice 1 ledger plus
-- every Phase 2A/legacy primitive intact. Roll the proof itself back so the
-- wrapper can still inspect the functions after this script.
BEGIN;
DROP FUNCTION public.reconcile_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text, jsonb, text
);
DROP FUNCTION public.begin_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text
);
DROP FUNCTION public.reserve_agentic_chat_effect(
	uuid, uuid, uuid, uuid, integer, text, text, text, boolean, text
);

SELECT pg_temp.assert_true(
	to_regprocedure(
		'public.reserve_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text,text,boolean,text)'
	) IS NULL
		AND to_regprocedure(
			'public.begin_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text)'
		) IS NULL
		AND to_regprocedure(
			'public.reconcile_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text,jsonb,text)'
		) IS NULL
		AND to_regclass('public.chat_turn_effects') IS NOT NULL
		AND EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
				AND table_name = 'chat_tool_executions'
				AND column_name = 'effect_id'
		)
		AND to_regclass('public.chat_turn_stream_state') IS NOT NULL
		AND to_regclass('public.chat_turn_signals') IS NOT NULL
		AND to_regprocedure('public.reset_stalled_jobs(text,text[],text[])') IS NOT NULL
		AND to_regprocedure(
			'public.admit_legacy_agentic_chat_turn(uuid,uuid,uuid,uuid,text,text,text,text,text,uuid,uuid,text,boolean,text,timestamptz,text,jsonb,integer,integer,integer,integer)'
		) IS NOT NULL,
	'effect RPC rollback removed or depended on an earlier package'
);
ROLLBACK;

SELECT pg_temp.assert_true(
	to_regprocedure(
		'public.reserve_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text,text,boolean,text)'
	) IS NOT NULL
		AND to_regprocedure(
			'public.begin_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text)'
		) IS NOT NULL
		AND to_regprocedure(
			'public.reconcile_agentic_chat_effect(uuid,uuid,uuid,uuid,integer,text,text,jsonb,text)'
		) IS NOT NULL,
	'rollback proof did not restore the disposable database transaction'
);

SELECT 'phase2b_effect_rpcs_ok' AS result;
