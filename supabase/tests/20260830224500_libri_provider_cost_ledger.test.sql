-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/libri_provider_cost_ledger_base.sql

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF COALESCE(p_condition, false) IS NOT TRUE THEN
		RAISE EXCEPTION 'assertion failed: %', p_message;
	END IF;
END;
$$;

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 5 AND bool_and(NOT routine.prosecdef)
		FROM pg_catalog.pg_proc AS routine
		JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = routine.pronamespace
		WHERE namespace.nspname = 'libri'
			AND routine.proname IN (
				'enforce_provider_cost_reservation_write',
				'reserve_provider_cost',
				'start_provider_cost',
				'settle_provider_cost',
				'release_provider_cost'
			)
	),
	'provider-cost routines and enforcement trigger must remain security invoker'
);
SELECT pg_temp.assert_true(
	has_function_privilege(
		'libri_worker',
		'libri.reserve_provider_cost(uuid,integer,uuid,text,text,text,bigint)',
		'EXECUTE'
	)
		AND has_function_privilege(
			'libri_worker',
			'libri.start_provider_cost(uuid,integer,uuid)',
			'EXECUTE'
		)
		AND has_function_privilege(
			'libri_worker',
			'libri.settle_provider_cost(uuid,integer,uuid,bigint,bigint,bigint,text)',
			'EXECUTE'
		)
		AND has_function_privilege(
			'libri_worker',
			'libri.release_provider_cost(uuid,integer,uuid,text)',
			'EXECUTE'
		)
		AND NOT has_table_privilege(
			'libri_worker',
			'libri.provider_cost_reservations',
			'DELETE'
		)
		AND NOT has_column_privilege(
			'libri_worker',
			'libri.provider_cost_reservations',
			'reserved_microusd',
			'UPDATE'
		)
		AND NOT has_column_privilege(
			'libri_worker',
			'libri.research_runs',
			'cost_budget_microusd',
			'UPDATE'
		),
	'worker must receive only the reviewed cost-ledger capabilities'
);
SELECT pg_temp.assert_true(
	(
		SELECT array_agg(policyname::text ORDER BY policyname::text)
		FROM pg_policies
		WHERE schemaname = 'libri'
			AND tablename = 'provider_cost_reservations'
			AND 'libri_worker' = ANY(roles)
	) = ARRAY[
		'provider_cost_reservations_libri_worker_insert',
		'provider_cost_reservations_libri_worker_select',
		'provider_cost_reservations_libri_worker_update'
	],
	'cost ledger must expose exactly the reviewed worker RLS policies'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (
		SELECT 1
		FROM information_schema.columns
		WHERE table_schema = 'libri'
			AND table_name = 'research_runs'
			AND column_name IN (
				'cost_reserved_microusd',
				'cost_spent_microusd',
				'cost_reconciliation_required'
			)
	),
	'cost state must be derived from the ledger instead of mutable run counters'
);

INSERT INTO auth.users (id) VALUES ('81111111-1111-4111-8111-111111111111');
INSERT INTO libri.libraries (id, slug, name, created_by) VALUES (
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'cost-ledger-test',
	'Cost ledger test library',
	'81111111-1111-4111-8111-111111111111'
);
INSERT INTO libri.library_members (library_id, user_id, role) VALUES (
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'81111111-1111-4111-8111-111111111111',
	'owner'
);

INSERT INTO libri.research_runs (
	id,
	library_id,
	idempotency_key,
	queue_family,
	kind,
	subject_type,
	subject_id,
	requested_by_actor,
	status,
	started_at,
	planned_steps,
	cost_budget_microusd
) VALUES
(
	'81000000-0000-4000-8000-000000000001',
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'cost-ledger-normal',
	'libri_ingest',
	'ocr_image',
	'library',
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'system',
	'running',
	now(),
	1,
	1000
),
(
	'81000000-0000-4000-8000-000000000002',
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'cost-ledger-overrun',
	'libri_ingest',
	'ocr_image',
	'library',
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'system',
	'running',
	now(),
	1,
	100
);

INSERT INTO libri.research_steps (
	id,
	library_id,
	run_id,
	idempotency_key,
	queue_family,
	kind,
	stage,
	position,
	status,
	active_queue_job_id,
	active_processing_token,
	execution_generation,
	lease_token,
	lease_owner,
	leased_at,
	lease_expires_at,
	last_heartbeat_at,
	started_at
) VALUES
(
	'82000000-0000-4000-8000-000000000001',
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'81000000-0000-4000-8000-000000000001',
	'cost-ledger-normal-step',
	'libri_ingest',
	'ocr_image',
	'capture_sources',
	0,
	'leased',
	'83000000-0000-4000-8000-000000000001',
	'83111111-1111-4111-8111-111111111111',
	1,
	'84000000-0000-4000-8000-000000000001',
	'libri-worker:test',
	now(),
	now() + interval '5 minutes',
	now(),
	now()
),
(
	'82000000-0000-4000-8000-000000000002',
	'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
	'81000000-0000-4000-8000-000000000002',
	'cost-ledger-overrun-step',
	'libri_ingest',
	'ocr_image',
	'capture_sources',
	0,
	'leased',
	'83000000-0000-4000-8000-000000000002',
	'83222222-2222-4222-8222-222222222222',
	1,
	'84000000-0000-4000-8000-000000000002',
	'libri-worker:test',
	now(),
	now() + interval '5 minutes',
	now(),
	now()
);

INSERT INTO public.queue_jobs (
	id,
	queue_job_id,
	user_id,
	job_type,
	status,
	priority,
	scheduled_for
) VALUES (
	'85000000-0000-4000-8000-000000000001',
	'buildos_cost_ledger_control',
	'81111111-1111-4111-8111-111111111111',
	'other',
	'pending',
	1,
	now()
);

SET ROLE libri_worker;

CREATE TEMP TABLE normal_reservation AS
SELECT *
FROM libri.reserve_provider_cost(
	'82000000-0000-4000-8000-000000000001',
	1,
	'84000000-0000-4000-8000-000000000001',
	'ocr-call-1',
	'openrouter',
	'openai/gpt-4o-mini',
	100
);

SELECT pg_temp.assert_true(
	(
		SELECT outcome = 'reserved'
			AND created
			AND reservation_amount_microusd = 100
			AND remaining_microusd = 900
		FROM normal_reservation
	),
	'a valid current lease must atomically reserve cost'
);
SELECT pg_temp.assert_true(
	(
		SELECT NOT created AND outcome = 'reserved' AND reservation_id IS NOT NULL
		FROM libri.reserve_provider_cost(
			'82000000-0000-4000-8000-000000000001',
			1,
			'84000000-0000-4000-8000-000000000001',
			'ocr-call-1',
			'openrouter',
			'openai/gpt-4o-mini',
			100
		)
	),
	'an identical reservation retry must be idempotent'
);
SELECT pg_temp.assert_true(
	(
		SELECT outcome = 'budget_unavailable' AND reservation_id IS NULL
		FROM libri.reserve_provider_cost(
			'82000000-0000-4000-8000-000000000001',
			1,
			'84000000-0000-4000-8000-000000000001',
			'ocr-call-too-large',
			'openrouter',
			'openai/gpt-4o-mini',
			901
		)
	),
	'cost admission must fail before exceeding the remaining run budget'
);
SELECT pg_temp.assert_true(
	(
		SELECT NOT authorized AND outcome = 'stale'
		FROM libri.start_provider_cost(
			(SELECT reservation_id FROM normal_reservation),
			1,
			'84999999-9999-4999-8999-999999999999'
		)
	),
	'a mismatched lease token must not authorize a provider call'
);
SELECT pg_temp.assert_true(
	(
		SELECT authorized AND outcome = 'started'
		FROM libri.start_provider_cost(
			(SELECT reservation_id FROM normal_reservation),
			1,
			'84000000-0000-4000-8000-000000000001'
		)
	),
	'a current fenced reservation must authorize one provider call'
);
SELECT pg_temp.assert_true(
	(
		SELECT NOT authorized AND outcome = 'started'
		FROM libri.start_provider_cost(
			(SELECT reservation_id FROM normal_reservation),
			1,
			'84000000-0000-4000-8000-000000000001'
		)
	),
	'an authorization retry must not grant duplicate provider authority'
);
SELECT pg_temp.assert_true(
	(
		SELECT NOT accepted AND outcome = 'started'
		FROM libri.release_provider_cost(
			(SELECT reservation_id FROM normal_reservation),
			1,
			'84000000-0000-4000-8000-000000000001',
			'unsafe release after provider start'
		)
	),
	'a reservation must never be released after provider authority begins'
);
SELECT pg_temp.assert_true(
	(
		SELECT accepted
			AND outcome = 'settled'
			AND NOT over_budget
			AND total_spent_microusd = 70
			AND remaining_microusd = 930
		FROM libri.settle_provider_cost(
			(SELECT reservation_id FROM normal_reservation),
			1,
			'84000000-0000-4000-8000-000000000001',
			70,
			120,
			30,
			'openrouter-request-normal'
		)
	),
	'settlement must release the reservation and record exact provider usage'
);
SELECT pg_temp.assert_true(
	(
		SELECT accepted AND total_spent_microusd = 70
		FROM libri.settle_provider_cost(
			(SELECT reservation_id FROM normal_reservation),
			1,
			'84000000-0000-4000-8000-000000000001',
			70,
			120,
			30,
			'openrouter-request-normal'
		)
	),
	'an identical settlement retry must not double-charge the run'
);

CREATE TEMP TABLE released_reservation AS
SELECT *
FROM libri.reserve_provider_cost(
	'82000000-0000-4000-8000-000000000001',
	1,
	'84000000-0000-4000-8000-000000000001',
	'ocr-call-released',
	'openrouter',
	'openai/gpt-4o-mini',
	200
);
SELECT pg_temp.assert_true(
	(
		SELECT accepted AND outcome = 'released' AND remaining_microusd = 930
		FROM libri.release_provider_cost(
			(SELECT reservation_id FROM released_reservation),
			1,
			'84000000-0000-4000-8000-000000000001',
			'provider call never started'
		)
	),
	'a pre-provider reservation must be safely releasable'
);

CREATE TEMP TABLE overrun_reservation AS
SELECT *
FROM libri.reserve_provider_cost(
	'82000000-0000-4000-8000-000000000002',
	1,
	'84000000-0000-4000-8000-000000000002',
	'ocr-call-overrun',
	'openrouter',
	'openai/gpt-4o-mini',
	80
);
SELECT pg_temp.assert_true(
	(
		SELECT authorized AND outcome = 'started'
		FROM libri.start_provider_cost(
			(SELECT reservation_id FROM overrun_reservation),
			1,
			'84000000-0000-4000-8000-000000000002'
		)
	),
	'the overrun fixture must receive provider authority before settlement'
);
SELECT pg_temp.assert_true(
	(
		SELECT accepted AND over_budget AND total_spent_microusd = 120
		FROM libri.settle_provider_cost(
			(SELECT reservation_id FROM overrun_reservation),
			1,
			'84000000-0000-4000-8000-000000000002',
			120,
			10,
			10,
			'openrouter-request-overrun'
		)
	),
	'an unexpected provider overrun must be recorded instead of hidden'
);
SELECT pg_temp.assert_true(
	(
		SELECT status = 'settled'
			AND reserved_microusd = 80
			AND actual_cost_microusd = 120
		FROM libri.provider_cost_reservations
		WHERE run_id = '81000000-0000-4000-8000-000000000002'
	),
	'an overrun must stop future cost admission and require reconciliation'
);
SELECT pg_temp.assert_true(
	(
		SELECT outcome = 'reconciliation_required' AND reservation_id IS NULL
		FROM libri.reserve_provider_cost(
			'82000000-0000-4000-8000-000000000002',
			1,
			'84000000-0000-4000-8000-000000000002',
			'ocr-call-after-overrun',
			'openrouter',
			'openai/gpt-4o-mini',
			1
		)
	),
	'reconciliation-required runs must reject every later reservation'
);

DO $$
DECLARE
	transition_blocked boolean := false;
	overspend_blocked boolean := false;
BEGIN
	BEGIN
		UPDATE libri.research_runs
		SET cost_budget_microusd = 999999
		WHERE id = '81000000-0000-4000-8000-000000000001';
		RAISE EXCEPTION 'worker unexpectedly changed the operator-owned budget';
	EXCEPTION WHEN insufficient_privilege THEN
		NULL;
	END;
	BEGIN
		UPDATE libri.provider_cost_reservations
		SET reserved_microusd = 1;
		RAISE EXCEPTION 'worker unexpectedly changed an immutable reservation amount';
	EXCEPTION WHEN insufficient_privilege THEN
		NULL;
	END;
	BEGIN
		UPDATE libri.provider_cost_reservations
		SET
			status = 'started',
			release_reason = NULL,
			released_at = NULL,
			started_at = now()
		WHERE id = (SELECT reservation_id FROM released_reservation);
	EXCEPTION WHEN raise_exception THEN
		transition_blocked := true;
	END;
	IF NOT transition_blocked THEN
		RAISE EXCEPTION 'worker bypassed the provider-cost transition guard';
	END IF;
	BEGIN
		INSERT INTO libri.provider_cost_reservations (
			library_id,
			run_id,
			step_id,
			execution_generation,
			lease_token,
			reservation_key,
			provider,
			model,
			reserved_microusd
		) VALUES (
			'8aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
			'81000000-0000-4000-8000-000000000001',
			'82000000-0000-4000-8000-000000000001',
			1,
			'84000000-0000-4000-8000-000000000001',
			'direct-overspend',
			'openrouter',
			'openai/gpt-4o-mini',
			999999
		);
	EXCEPTION WHEN raise_exception THEN
		overspend_blocked := true;
	END;
	IF NOT overspend_blocked THEN
		RAISE EXCEPTION 'worker bypassed the provider-cost budget guard';
	END IF;
END;
$$;

RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT status = 'pending'::public.queue_status
		FROM public.queue_jobs
		WHERE id = '85000000-0000-4000-8000-000000000001'
	),
	'provider-cost activity must leave the non-Libri BuildOS queue row unchanged'
);
