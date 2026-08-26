-- supabase/tests/20260826014109_daily_brief_cycle_lead_time.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/cycles_v0_foundation_base.sql
\ir ../migrations/20260825211342_add_run_cycle_queue_type.sql
\ir ../migrations/20260825211343_cycles_v0_foundation.sql
\ir ../migrations/20260825211344_cycles_v0_commands.sql
\ir ../migrations/20260826010526_harden_cycle_service_role_wrappers.sql
\ir ../migrations/20260826011409_cycle_due_trigger_coordinator.sql
\ir ../migrations/20260826013205_add_cycle_misfire_skip_resolution.sql
\ir ../migrations/20260826014109_add_daily_brief_cycle_lead_time.sql

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
	public.cycle_definition_payload_is_valid(
		'daily_brief', 'user', NULL, '{}',
		'{"overlap":"skip","misfire":"run_once","max_attempts":3}', 'always', 'active'
	),
	'empty Daily Brief config must retain the default lead'
);
SELECT pg_temp.assert_true(
	public.cycle_definition_payload_is_valid(
		'daily_brief', 'user', NULL, '{"generation_lead_minutes":30}',
		'{"overlap":"skip","misfire":"run_once","max_attempts":3}', 'always', 'active'
	),
	'the maximum Daily Brief lead must be accepted'
);
SELECT pg_temp.assert_true(
	NOT public.cycle_definition_payload_is_valid(
		'daily_brief', 'user', NULL, '{"generation_lead_minutes":31}',
		'{"overlap":"skip","misfire":"run_once","max_attempts":3}', 'always', 'active'
	),
	'lead times above the bound must be rejected'
);
SELECT pg_temp.assert_true(
	NOT public.cycle_definition_payload_is_valid(
		'daily_brief', 'user', NULL, '{"generation_lead_minutes":2.5}',
		'{"overlap":"skip","misfire":"run_once","max_attempts":3}', 'always', 'active'
	),
	'fractional lead times must be rejected'
);

INSERT INTO public.users (id, name, email) VALUES
	('11111111-1111-4111-8111-111111111111', 'Default lead', 'default@example.test'),
	('22222222-2222-4222-8222-222222222222', 'No lead', 'none@example.test'),
	('33333333-3333-4333-8333-333333333333', 'Ten minute lead', 'ten@example.test');

INSERT INTO public.cycles (
	id, user_id, create_request_id, create_request_fingerprint,
	label, kind, target_type, config, policy, attention_policy
) VALUES
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
		'11111111-1111-4111-8111-111111111111',
		'lead-default', repeat('1', 64), 'Default lead', 'daily_brief', 'user', '{}',
		'{"overlap":"skip","misfire":"run_once","max_attempts":3}', 'always'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
		'22222222-2222-4222-8222-222222222222',
		'lead-none', repeat('2', 64), 'No lead', 'daily_brief', 'user',
		'{"generation_lead_minutes":0}',
		'{"overlap":"skip","misfire":"run_once","max_attempts":3}', 'always'
	),
	(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
		'33333333-3333-4333-8333-333333333333',
		'lead-ten', repeat('3', 64), 'Ten minute lead', 'daily_brief', 'user',
		'{"generation_lead_minutes":10}',
		'{"overlap":"skip","misfire":"run_once","max_attempts":3}', 'always'
	);

INSERT INTO public.cycle_triggers (id, cycle_id, trigger_type, spec, next_run_at) VALUES
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
	);

SELECT pg_temp.assert_true(
	jsonb_array_length(public.claim_due_cycle_triggers(
		'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
		'2026-08-25T12:58:00Z', 25, 120, ARRAY['daily_brief']
	)) = 2,
	'the default two-minute and configured ten-minute leads must lease at 12:58'
);
SELECT pg_temp.assert_true(
	(
		SELECT scheduler_claim_token IS NULL
		FROM public.cycle_triggers
		WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2'
	),
	'a zero-lead Cycle must remain unclaimed before its nominal schedule'
);
SELECT pg_temp.assert_true(
	(
		SELECT bool_and(next_run_at = '2026-08-25T13:00:00Z')
		FROM public.cycle_triggers
	),
	'early leasing must not move nominal trigger projections'
);
