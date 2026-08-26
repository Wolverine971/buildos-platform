-- supabase/tests/20260826020000_cycle_queue_ownership_fencing.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
--
-- REGRESSION CONTRACT. A Cycle terminal write must
-- require the paired queue row to still be processing under the same token,
-- not merely a matching token cached on cycle_runs.

\set ON_ERROR_STOP on
\ir fixtures/cycle_worker_adversarial_base.sql

CREATE TEMP TABLE adversarial_failures (message text NOT NULL);
CREATE FUNCTION pg_temp.expect_true(p_condition boolean, p_message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
	IF COALESCE(p_condition, false) IS NOT TRUE THEN
		INSERT INTO adversarial_failures (message) VALUES (p_message);
	END IF;
END;
$$;

SELECT pg_temp.create_adversarial_daily_brief_cycle(
	'11111111-1111-4111-8111-111111111111',
	'21111111-1111-4111-8111-111111111111',
	'queue-ownership-complete'
);
SELECT public.admit_cycle_run(
	'21111111-1111-4111-8111-111111111111',
	'manual',
	'manual:stale-complete',
	'{"mode":"manual","brief_date":"2026-08-26","timezone":"UTC","force_regenerate":false}',
	'{"mode":"suppress","reason":"adversarial_test"}'
);
UPDATE public.queue_jobs queue_row
SET status = 'processing',
	processing_token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	started_at = now(),
	updated_at = now()
FROM public.cycle_runs run_row
WHERE run_row.occurrence_key = 'manual:stale-complete'
	AND queue_row.id = run_row.queue_job_record_id;
SELECT public.claim_cycle_run(
	(SELECT id FROM public.cycle_runs WHERE occurrence_key = 'manual:stale-complete'),
	(SELECT queue_job_record_id FROM public.cycle_runs WHERE occurrence_key = 'manual:stale-complete'),
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

-- Model fail_queue_job/reset_stalled_jobs revoking the worker's queue claim
-- while its handler promise is still running.
UPDATE public.queue_jobs queue_row
SET status = 'pending',
	processing_token = NULL,
	started_at = NULL,
	attempts = attempts + 1,
	updated_at = now()
FROM public.cycle_runs run_row
WHERE run_row.occurrence_key = 'manual:stale-complete'
	AND queue_row.id = run_row.queue_job_record_id;

SELECT pg_temp.expect_true(
	NOT public.complete_cycle_run(
		(SELECT id FROM public.cycle_runs WHERE occurrence_key = 'manual:stale-complete'),
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
		'{"status":"artifact_created","attention_level":"minor","summary":"Stale worker result.","artifact_refs":[]}',
		'{"brief_id":"stale"}'
	),
	'a stale executor completed a Cycle Run after losing queue ownership'
);
SELECT pg_temp.expect_true(
	(
		SELECT status = 'running'
		FROM public.cycle_runs
		WHERE occurrence_key = 'manual:stale-complete'
	),
	'a rejected stale completion mutated the Cycle Run terminal state'
);

SELECT pg_temp.create_adversarial_daily_brief_cycle(
	'12222222-2222-4222-8222-222222222222',
	'22222222-2222-4222-8222-222222222222',
	'queue-ownership-fail'
);
SELECT public.admit_cycle_run(
	'22222222-2222-4222-8222-222222222222',
	'manual',
	'manual:stale-fail',
	'{"mode":"manual","brief_date":"2026-08-26","timezone":"UTC","force_regenerate":false}',
	'{"mode":"suppress","reason":"adversarial_test"}'
);
UPDATE public.queue_jobs queue_row
SET status = 'processing',
	processing_token = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
	started_at = now(),
	updated_at = now()
FROM public.cycle_runs run_row
WHERE run_row.occurrence_key = 'manual:stale-fail'
	AND queue_row.id = run_row.queue_job_record_id;
SELECT public.claim_cycle_run(
	(SELECT id FROM public.cycle_runs WHERE occurrence_key = 'manual:stale-fail'),
	(SELECT queue_job_record_id FROM public.cycle_runs WHERE occurrence_key = 'manual:stale-fail'),
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
);
UPDATE public.queue_jobs queue_row
SET status = 'pending',
	processing_token = NULL,
	started_at = NULL,
	attempts = attempts + 1,
	updated_at = now()
FROM public.cycle_runs run_row
WHERE run_row.occurrence_key = 'manual:stale-fail'
	AND queue_row.id = run_row.queue_job_record_id;

SELECT pg_temp.expect_true(
	NOT public.fail_cycle_run(
		(SELECT id FROM public.cycle_runs WHERE occurrence_key = 'manual:stale-fail'),
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
		'stale_worker_failure',
		'Stale worker tried to fail the Run.',
		true
	),
	'a stale executor failed a Cycle Run after losing queue ownership'
);
SELECT pg_temp.expect_true(
	(
		SELECT status = 'running'
		FROM public.cycle_runs
		WHERE occurrence_key = 'manual:stale-fail'
	),
	'a rejected stale failure mutated the Cycle Run terminal state'
);

DO $$
DECLARE
	v_failures text;
BEGIN
	SELECT string_agg(message, E'\n - ' ORDER BY message)
	INTO v_failures
	FROM adversarial_failures;

	IF v_failures IS NOT NULL THEN
		RAISE EXCEPTION E'adversarial queue-ownership contract failed:\n - %', v_failures;
	END IF;
END;
$$;
