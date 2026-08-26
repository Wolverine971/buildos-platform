-- supabase/tests/20260826020100_cycle_terminal_stalled_recovery.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
--
-- REGRESSION CONTRACT. Exhausting a run_cycle queue
-- job through generic stalled recovery must terminalize its Cycle Run in the
-- same recovery boundary; otherwise overlap=skip blocks every future occurrence.

\set ON_ERROR_STOP on
\ir fixtures/cycle_worker_adversarial_base.sql

SELECT pg_temp.create_adversarial_daily_brief_cycle(
	'11111111-1111-4111-8111-111111111111',
	'22222222-2222-4222-8222-222222222222',
	'terminal-stalled-recovery'
);
SELECT public.admit_cycle_run(
	'22222222-2222-4222-8222-222222222222',
	'manual',
	'manual:terminal-stall',
	'{"mode":"manual","brief_date":"2026-08-26","timezone":"UTC","force_regenerate":false}',
	'{"mode":"suppress","reason":"adversarial_test"}'
);
UPDATE public.queue_jobs queue_row
SET status = 'processing',
	processing_token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	attempts = 2,
	max_attempts = 3,
	started_at = now() - interval '1 hour',
	updated_at = now() - interval '1 hour'
FROM public.cycle_runs run_row
WHERE run_row.occurrence_key = 'manual:terminal-stall'
	AND queue_row.id = run_row.queue_job_record_id;
SELECT public.claim_cycle_run(
	(SELECT id FROM public.cycle_runs WHERE occurrence_key = 'manual:terminal-stall'),
	(SELECT queue_job_record_id FROM public.cycle_runs WHERE occurrence_key = 'manual:terminal-stall'),
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
);

SELECT pg_temp.assert_true(
	public.reset_stalled_jobs(
		'5 minutes',
		ARRAY['run_cycle'],
		ARRAY[]::text[]
	) = 1,
	'the generic recovery fixture must find the exhausted run_cycle job'
);
SELECT pg_temp.assert_true(
	(
		SELECT queue_row.status = 'failed'
			AND queue_row.attempts = 3
			AND queue_row.processing_token IS NULL
		FROM public.queue_jobs queue_row
		JOIN public.cycle_runs run_row ON run_row.queue_job_record_id = queue_row.id
		WHERE run_row.occurrence_key = 'manual:terminal-stall'
	),
	'the exhausted queue job must be terminal before checking domain reconciliation'
);
SELECT pg_temp.assert_true(
	(
		SELECT status = 'failed'
			AND processing_token IS NULL
			AND finished_at IS NOT NULL
			AND outcome->>'status' = 'failed'
		FROM public.cycle_runs
		WHERE occurrence_key = 'manual:terminal-stall'
	),
	'an exhausted stalled queue job must terminalize its Cycle Run'
);
SELECT pg_temp.assert_true(
	(
		SELECT last_error IS NOT NULL
		FROM public.cycles
		WHERE id = '22222222-2222-4222-8222-222222222222'
	),
	'terminal stalled recovery must surface the failure on the parent Cycle'
);
