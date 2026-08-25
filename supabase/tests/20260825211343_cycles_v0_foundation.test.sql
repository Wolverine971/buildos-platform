-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/cycles_v0_foundation_base.sql
\ir ../migrations/20260825211342_add_run_cycle_queue_type.sql
\ir ../migrations/20260825211343_cycles_v0_foundation.sql

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

INSERT INTO public.users (id) VALUES ('11111111-1111-4111-8111-111111111111');

INSERT INTO public.cycles (
	id, user_id, create_request_id, create_request_fingerprint,
	label, kind, target_type, config, policy, attention_policy
) VALUES (
	'22222222-2222-4222-8222-222222222222',
	'11111111-1111-4111-8111-111111111111',
	'create-daily-brief-1',
	repeat('0', 64),
	'Daily Brief',
	'daily_brief',
	'user',
	'{}',
	'{"overlap":"skip","misfire":"run_once","max_attempts":3}',
	'always'
);

INSERT INTO public.cycle_triggers (
	id, cycle_id, trigger_type, spec, next_run_at
) VALUES (
	'33333333-3333-4333-8333-333333333333',
	'22222222-2222-4222-8222-222222222222',
	'schedule',
	'{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"America/New_York"}}',
	'2026-08-25T13:00:00Z'
);

SELECT public.admit_cycle_run(
	'22222222-2222-4222-8222-222222222222',
	'schedule',
	'schedule:2026-08-25T13:00:00Z',
	'{"mode":"scheduled","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
	'{"mode":"evaluate","not_before":"2026-08-25T13:00:00Z"}',
	'33333333-3333-4333-8333-333333333333',
	'2026-08-25T12:58:00Z',
	'2026-08-25T13:00:00Z',
	'2026-08-26T13:00:00Z'
) AS admission \gset

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.cycle_runs),
	'one occurrence must create one Cycle Run'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.queue_jobs WHERE job_type = 'run_cycle'),
	'admission must create one generic queue job'
);
SELECT pg_temp.assert_true(
	(SELECT max_attempts = 3 FROM public.queue_jobs WHERE job_type = 'run_cycle'),
	'Cycle retry policy must reach queue transport'
);
SELECT pg_temp.assert_true(
	(SELECT next_run_at = '2026-08-26T13:00:00Z' FROM public.cycle_triggers),
	'trigger advancement must commit with admission'
);

SELECT public.admit_cycle_run(
	'22222222-2222-4222-8222-222222222222',
	'schedule',
	'schedule:2026-08-25T13:00:00Z',
	'{"mode":"scheduled","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
	'{"mode":"evaluate","not_before":"2026-08-25T13:00:00Z"}',
	'33333333-3333-4333-8333-333333333333',
	'2026-08-25T12:58:00Z',
	'2026-08-25T13:00:00Z'
);

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.cycle_runs),
	'a retried occurrence must reuse its admitted Run'
);

UPDATE public.queue_jobs
SET status = 'processing',
	processing_token = '44444444-4444-4444-8444-444444444444',
	started_at = now()
WHERE job_type = 'run_cycle';

SELECT public.claim_cycle_run(
	(SELECT id FROM public.cycle_runs),
	(SELECT id FROM public.queue_jobs WHERE job_type = 'run_cycle'),
	'44444444-4444-4444-8444-444444444444'
);

SELECT pg_temp.assert_true(
	(SELECT status = 'running' AND attempt_count = 1 FROM public.cycle_runs),
	'owned queue claim must fence and start the Cycle Run'
);

DO $$
BEGIN
	BEGIN
		PERFORM public.complete_cycle_run(
			(SELECT id FROM public.cycle_runs),
			'44444444-4444-4444-8444-444444444444',
			'{"status":"no_change","attention_level":"urgent","summary":"Invalid pair.","artifact_refs":[]}',
			NULL
		);
		RAISE EXCEPTION 'expected invalid outcome failure';
	EXCEPTION
		WHEN SQLSTATE '22023' THEN NULL;
	END;
END;
$$;

SELECT pg_temp.assert_true(
	(SELECT status = 'running' FROM public.cycle_runs),
	'an invalid normalized outcome must not complete the Cycle Run'
);

SELECT pg_temp.assert_true(
	public.complete_cycle_run(
		(SELECT id FROM public.cycle_runs),
		'44444444-4444-4444-8444-444444444444',
		'{"status":"artifact_created","attention_level":"minor","summary":"Daily brief is ready.","artifact_refs":[{"type":"daily_brief","id":"55555555-5555-4555-8555-555555555555"}]}',
		'{"brief_id":"55555555-5555-4555-8555-555555555555"}'
	),
	'owned processor must complete the Cycle Run'
);

SELECT pg_temp.assert_true(
	(
		SELECT run.status = 'completed'
			AND cycle.last_run_id = run.id
			AND cycle.last_error IS NULL
		FROM public.cycle_runs run
		JOIN public.cycles cycle ON cycle.id = run.cycle_id
	),
	'completion must update domain status and Cycle projection'
);

DO $$
BEGIN
	BEGIN
		UPDATE public.cycle_runs SET occurrence_key = 'mutated';
		RAISE EXCEPTION 'expected immutable identity failure';
	EXCEPTION
		WHEN SQLSTATE '23514' THEN NULL;
	END;
END;
$$;

SELECT public.admit_cycle_run(
	'22222222-2222-4222-8222-222222222222',
	'manual',
	'manual:terminal-failure-test',
	'{"mode":"manual","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
	'{"mode":"suppress","reason":"test"}'
);

UPDATE public.queue_jobs queue_row
SET status = 'processing',
	processing_token = '66666666-6666-4666-8666-666666666666',
	started_at = now()
FROM public.cycle_runs run
WHERE run.occurrence_key = 'manual:terminal-failure-test'
	AND queue_row.id = run.queue_job_record_id;

SELECT public.claim_cycle_run(
	(SELECT id FROM public.cycle_runs WHERE occurrence_key = 'manual:terminal-failure-test'),
	(SELECT queue_job_record_id FROM public.cycle_runs WHERE occurrence_key = 'manual:terminal-failure-test'),
	'66666666-6666-4666-8666-666666666666'
);

SELECT pg_temp.assert_true(
	public.fail_cycle_run(
		(SELECT id FROM public.cycle_runs WHERE occurrence_key = 'manual:terminal-failure-test'),
		'66666666-6666-4666-8666-666666666666',
		'test_terminal_failure',
		'Terminal failure for reclaim test.',
		true
	),
	'owned processor must record a terminal Cycle Run failure'
);

UPDATE public.queue_jobs queue_row
SET status = 'processing',
	processing_token = '77777777-7777-4777-8777-777777777777'
FROM public.cycle_runs run
WHERE run.occurrence_key = 'manual:terminal-failure-test'
	AND queue_row.id = run.queue_job_record_id;

SELECT pg_temp.assert_true(
	(
		public.claim_cycle_run(
			(SELECT id FROM public.cycle_runs WHERE occurrence_key = 'manual:terminal-failure-test'),
			(SELECT queue_job_record_id FROM public.cycle_runs WHERE occurrence_key = 'manual:terminal-failure-test'),
			'77777777-7777-4777-8777-777777777777'
		)->>'disposition'
	) = 'already_terminal',
	'a terminally failed Cycle Run must never be reclaimed'
);

SELECT pg_temp.assert_true(
	(
		SELECT status = 'failed' AND attempt_count = 1
		FROM public.cycle_runs
		WHERE occurrence_key = 'manual:terminal-failure-test'
	),
	'a rejected reclaim must preserve terminal failure state and attempt count'
);

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.cycles),
	'owner must read their Cycle through RLS'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.cycle_triggers),
	'owner must read their Cycle triggers through RLS'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM public.cycle_runs),
	'owner must read their Cycle Run history through RLS'
);
SELECT set_config('request.jwt.claim.sub', '99999999-9999-4999-8999-999999999999', false);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.cycles),
	'other users must not read the Cycle through RLS'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.cycle_triggers),
	'other users must not read Cycle triggers through RLS'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 0 FROM public.cycle_runs),
	'other users must not read Cycle Run history through RLS'
);

DO $$
BEGIN
	BEGIN
		PERFORM public.admit_cycle_run(
			'22222222-2222-4222-8222-222222222222',
			'manual',
			'manual:unauthorized',
			'{"mode":"manual","brief_date":"2026-08-25","timezone":"UTC","force_regenerate":false}',
			'{"mode":"suppress","reason":"test"}'
		);
		RAISE EXCEPTION 'expected function privilege failure';
	EXCEPTION
		WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;
RESET ROLE;

SELECT pg_temp.assert_true(
	has_function_privilege(
		'service_role',
		'public.admit_cycle_run(uuid,text,text,jsonb,jsonb,uuid,timestamptz,timestamptz,timestamptz)',
		'EXECUTE'
	),
	'service role must execute Cycle admission'
);
SELECT pg_temp.assert_true(
	has_function_privilege(
		'service_role',
		'public.claim_cycle_run(uuid,uuid,uuid)',
		'EXECUTE'
	) AND has_function_privilege(
		'service_role',
		'public.complete_cycle_run(uuid,uuid,jsonb,jsonb)',
		'EXECUTE'
	) AND has_function_privilege(
		'service_role',
		'public.fail_cycle_run(uuid,uuid,text,text,boolean)',
		'EXECUTE'
	),
	'service role must execute the fenced Cycle Run lifecycle'
);

SET ROLE service_role;
SELECT public.admit_cycle_run(
	'22222222-2222-4222-8222-222222222222',
	'manual',
	'manual:service-role-proof',
	'{"mode":"manual","brief_date":"2026-08-25","timezone":"UTC","force_regenerate":false}',
	'{"mode":"suppress","reason":"test"}'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.cycle_runs WHERE occurrence_key = 'manual:service-role-proof'),
	'service-role admission must work without direct Cycle-table mutation grants'
);
