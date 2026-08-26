-- supabase/tests/20260826013205_cycle_misfire_overlap.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/cycles_v0_foundation_base.sql
\ir ../migrations/20260825211342_add_run_cycle_queue_type.sql
\ir ../migrations/20260825211343_cycles_v0_foundation.sql
\ir ../migrations/20260825211344_cycles_v0_commands.sql
\ir ../migrations/20260826010526_harden_cycle_service_role_wrappers.sql
\ir ../migrations/20260826011409_cycle_due_trigger_coordinator.sql
\ir ../migrations/20260826013205_add_cycle_misfire_skip_resolution.sql

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

INSERT INTO public.users (id, name, email) VALUES
	('11111111-1111-4111-8111-111111111111', 'Skip overlap / run once', 'one@example.test'),
	('22222222-2222-4222-8222-222222222222', 'Allow overlap / run once', 'two@example.test'),
	('33333333-3333-4333-8333-333333333333', 'Skip overlap / skip misfire', 'three@example.test'),
	('44444444-4444-4444-8444-444444444444', 'Allow overlap / skip misfire', 'four@example.test');

INSERT INTO public.cycles (
	id, user_id, create_request_id, create_request_fingerprint,
	label, kind, target_type, config, policy, attention_policy
) VALUES
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'11111111-1111-4111-8111-111111111111',
		'matrix-1', repeat('1', 64), 'Matrix 1', 'daily_brief', 'user', '{}',
		'{"overlap":"skip","misfire":"run_once","max_attempts":3}', 'always'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'22222222-2222-4222-8222-222222222222',
		'matrix-2', repeat('2', 64), 'Matrix 2', 'daily_brief', 'user', '{}',
		'{"overlap":"allow","misfire":"run_once","max_attempts":3}', 'always'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
		'33333333-3333-4333-8333-333333333333',
		'matrix-3', repeat('3', 64), 'Matrix 3', 'daily_brief', 'user', '{}',
		'{"overlap":"skip","misfire":"skip","max_attempts":3}', 'always'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
		'44444444-4444-4444-8444-444444444444',
		'matrix-4', repeat('4', 64), 'Matrix 4', 'daily_brief', 'user', '{}',
		'{"overlap":"allow","misfire":"skip","max_attempts":3}', 'always'
	);

INSERT INTO public.cycle_triggers (
	id, cycle_id, trigger_type, spec, next_run_at
) VALUES
	(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'schedule',
		'{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"America/New_York"}}',
		'2026-08-25T13:00:00Z'
	),
	(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'schedule',
		'{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"America/New_York"}}',
		'2026-08-25T13:00:00Z'
	),
	(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
		'schedule',
		'{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"America/New_York"}}',
		'2026-08-25T13:00:00Z'
	),
	(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4',
		'schedule',
		'{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"America/New_York"}}',
		'2026-08-25T13:00:00Z'
	);

-- Keep one active Run on both run-once Cycles to exercise the overlap axis.
SELECT public.admit_cycle_run(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'manual', 'manual:active',
	'{"mode":"manual","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
	'{"mode":"suppress","reason":"matrix_setup"}'
);
SELECT public.admit_cycle_run(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'manual', 'manual:active',
	'{"mode":"manual","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
	'{"mode":"suppress","reason":"matrix_setup"}'
);

SELECT pg_temp.assert_true(
	jsonb_array_length(public.claim_due_cycle_triggers(
		'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
		'2026-08-25T13:06:00Z', 25, 120, ARRAY['daily_brief']
	)) = 4,
	'the matrix setup must lease all four due triggers'
);

SELECT pg_temp.assert_true(
	(public.admit_claimed_cycle_trigger(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
		'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
		'{"mode":"catch_up","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
		'{"mode":"evaluate","not_before":"2026-08-25T13:00:00Z"}',
		'2026-08-26T13:00:00Z', '2026-08-25T13:06:00Z'
	)->>'disposition') = 'skipped_overlap',
	'run_once plus overlap skip must preserve the occurrence but enqueue no second active Run'
);

SELECT pg_temp.assert_true(
	(public.admit_claimed_cycle_trigger(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
		'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
		'{"mode":"catch_up","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
		'{"mode":"evaluate","not_before":"2026-08-25T13:00:00Z"}',
		'2026-08-26T13:00:00Z', '2026-08-25T13:06:00Z'
	)->>'disposition') = 'admitted',
	'run_once plus overlap allow must enqueue the catch-up alongside the active Run'
);

SELECT pg_temp.assert_true(
	(public.skip_claimed_cycle_trigger(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
		'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
		'{"mode":"catch_up","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
		'2026-08-26T13:00:00Z', '2026-08-25T13:06:00Z'
	)->>'disposition') = 'skipped_misfire',
	'misfire skip must resolve without queueing when overlap is skip'
);

SELECT pg_temp.assert_true(
	(public.skip_claimed_cycle_trigger(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4',
		'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
		'{"mode":"catch_up","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
		'2026-08-26T13:00:00Z', '2026-08-25T13:06:00Z'
	)->>'disposition') = 'skipped_misfire',
	'misfire skip must resolve without queueing when overlap is allow'
);

SELECT pg_temp.assert_true(
	(SELECT count(*) = 6 FROM public.cycle_runs),
	'the four scheduled resolutions plus two active setup Runs must be retained in history'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 3 FROM public.queue_jobs WHERE job_type = 'run_cycle'),
	'only the two setup Runs and overlap-allow catch-up may create queue work'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 2
		FROM public.cycle_runs
		WHERE status = 'skipped'
			AND result->>'skip_reason' = 'misfire_policy'
			AND delivery_intent->>'reason' = 'misfire_policy_skip'
	),
	'misfire skips must be distinguishable from overlap skips in durable history'
);
SELECT pg_temp.assert_true(
	(
		SELECT bool_and(
			next_run_at = '2026-08-26T13:00:00Z'
			AND scheduler_claim_token IS NULL
			AND scheduler_claim_expires_at IS NULL
		)
		FROM public.cycle_triggers
	),
	'every matrix branch must advance and release its trigger atomically'
);

-- A caller cannot use the skip primitive against a run-once policy.
SELECT public.claim_due_cycle_triggers(
	'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
	'2026-08-26T13:01:00Z', 1, 120, ARRAY['daily_brief']
);
DO $$
BEGIN
	BEGIN
		PERFORM public.skip_claimed_cycle_trigger(
			(SELECT id FROM public.cycle_triggers WHERE scheduler_claim_token = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
			'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
			'{"mode":"catch_up","brief_date":"2026-08-26","timezone":"America/New_York","force_regenerate":false}',
			'2026-08-27T13:00:00Z', '2026-08-26T13:06:00Z'
		);
		RAISE EXCEPTION 'expected misfire policy mismatch';
	EXCEPTION WHEN SQLSTATE '22023' THEN
		IF SQLERRM <> 'cycle_misfire_policy_mismatch' THEN
			RAISE;
		END IF;
	END;
END;
$$;

SET ROLE authenticated;
DO $$
BEGIN
	BEGIN
		PERFORM public.skip_claimed_cycle_trigger(
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
			'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
			'{}', '2026-08-27T13:00:00Z'
		);
		RAISE EXCEPTION 'expected command privilege failure';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;
RESET ROLE;
