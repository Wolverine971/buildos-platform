-- supabase/tests/20260826011409_cycle_due_trigger_coordinator.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/cycles_v0_foundation_base.sql
\ir ../migrations/20260825211342_add_run_cycle_queue_type.sql
\ir ../migrations/20260825211343_cycles_v0_foundation.sql
\ir ../migrations/20260825211344_cycles_v0_commands.sql
\ir ../migrations/20260826010526_harden_cycle_service_role_wrappers.sql
\ir ../migrations/20260826011409_cycle_due_trigger_coordinator.sql

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
	('11111111-1111-4111-8111-111111111111', 'Owner', 'owner@example.test');

SET ROLE service_role;

SELECT public.create_cycle(
	'11111111-1111-4111-8111-111111111111',
	'due-daily-brief',
	'Daily Brief',
	'daily_brief',
	'user',
	NULL,
	'{}',
	'[{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"America/New_York"},"next_run_at":"2026-08-26T13:00:00Z"}]',
	'{"overlap":"skip","misfire":"run_once","max_attempts":3}',
	'always',
	'active'
);

CREATE TEMP TABLE claimed_cycle_triggers (payload jsonb);
INSERT INTO claimed_cycle_triggers (payload)
SELECT public.claim_due_cycle_triggers(
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	'2026-08-26T13:01:00Z',
	25,
	120,
	ARRAY['daily_brief']
);

SELECT pg_temp.assert_true(
	(
		SELECT jsonb_array_length(payload) = 1
			AND payload->0->>'kind' = 'daily_brief'
			AND payload->0->>'claim_token' = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
			AND (payload->0->>'scheduled_for')::timestamptz = '2026-08-26T13:00:00Z'
		FROM claimed_cycle_triggers
	),
	'a due schedule must be leased with its immutable occurrence context'
);
SELECT pg_temp.assert_true(
	jsonb_array_length(public.claim_due_cycle_triggers(
		'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
		'2026-08-26T13:01:00Z',
		25,
		120,
		ARRAY['daily_brief']
	)) = 0,
	'a live lease must prevent a second coordinator from claiming the same trigger'
);

DO $$
BEGIN
	BEGIN
		PERFORM public.admit_claimed_cycle_trigger(
			(SELECT (payload->0->>'trigger_id')::uuid FROM claimed_cycle_triggers),
			'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
			'{"mode":"scheduled","brief_date":"2026-08-26","timezone":"America/New_York","force_regenerate":false,"use_ontology":true}',
			'{"mode":"evaluate","not_before":"2026-08-26T13:00:00Z"}',
			'2026-08-27T13:00:00Z',
			'2026-08-26T13:00:05Z'
		);
		RAISE EXCEPTION 'expected scheduler claim fence failure';
	EXCEPTION WHEN SQLSTATE '55000' THEN
		IF SQLERRM <> 'cycle_trigger_claim_lost' THEN
			RAISE;
		END IF;
	END;
END;
$$;

SELECT public.admit_claimed_cycle_trigger(
	(SELECT (payload->0->>'trigger_id')::uuid FROM claimed_cycle_triggers),
	'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	'{"mode":"scheduled","brief_date":"2026-08-26","timezone":"America/New_York","force_regenerate":false,"use_ontology":true}',
	'{"mode":"evaluate","not_before":"2026-08-26T13:00:00Z"}',
	'2026-08-27T13:00:00Z',
	'2026-08-26T13:00:05Z'
);

RESET ROLE;

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
			AND min(status) = 'queued'
			AND min(scheduled_for) = '2026-08-26T13:00:00Z'
			AND bool_and(occurrence_key LIKE 'scheduled:%')
		FROM public.cycle_runs
	),
	'admitting a claimed trigger must create exactly one scheduled Cycle Run'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.queue_jobs queue_row
		JOIN public.cycle_runs run_row ON run_row.queue_job_record_id = queue_row.id
		WHERE queue_row.job_type = 'run_cycle'
			AND queue_row.status = 'pending'
	),
	'admission must create the generic queue job in the same transaction'
);
SELECT pg_temp.assert_true(
	(
		SELECT next_run_at = '2026-08-27T13:00:00Z'
			AND last_fired_at = '2026-08-26T13:00:05Z'
			AND scheduler_claim_token IS NULL
			AND scheduler_claim_expires_at IS NULL
		FROM public.cycle_triggers
		WHERE id = (SELECT (payload->0->>'trigger_id')::uuid FROM claimed_cycle_triggers)
	),
	'admission must advance the schedule and clear the lease atomically'
);

TRUNCATE claimed_cycle_triggers;
INSERT INTO claimed_cycle_triggers (payload)
SELECT public.claim_due_cycle_triggers(
	'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
	'2026-08-27T13:01:00Z',
	25,
	120,
	ARRAY['daily_brief']
);
SELECT pg_temp.assert_true(
	public.release_cycle_trigger_claim(
		(SELECT (payload->0->>'trigger_id')::uuid FROM claimed_cycle_triggers),
		'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
	),
	'a coordinator must be able to release work it cannot materialize'
);

-- Pausing before claim must exclude the trigger. Pausing after claim must
-- invalidate admission under the Cycle lock, even though the lease itself is
-- still live. This is the important race at the operator kill-switch boundary.
SELECT public.pause_cycle(
	'11111111-1111-4111-8111-111111111111',
	(SELECT id FROM public.cycles WHERE create_request_id = 'due-daily-brief'),
	1
);
SELECT pg_temp.assert_true(
	jsonb_array_length(public.claim_due_cycle_triggers(
		'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
		'2026-08-27T13:01:00Z',
		25,
		120,
		ARRAY['daily_brief']
	)) = 0,
	'a paused Cycle must not lease a due trigger'
);

SELECT public.resume_cycle(
	'11111111-1111-4111-8111-111111111111',
	(SELECT id FROM public.cycles WHERE create_request_id = 'due-daily-brief'),
	2
);
TRUNCATE claimed_cycle_triggers;
INSERT INTO claimed_cycle_triggers (payload)
SELECT public.claim_due_cycle_triggers(
	'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
	'2026-08-27T13:01:00Z',
	25,
	120,
	ARRAY['daily_brief']
);
SELECT pg_temp.assert_true(
	(SELECT jsonb_array_length(payload) = 1 FROM claimed_cycle_triggers),
	'the resumed Cycle must become claimable again'
);

SELECT public.pause_cycle(
	'11111111-1111-4111-8111-111111111111',
	(SELECT id FROM public.cycles WHERE create_request_id = 'due-daily-brief'),
	3
);
DO $$
BEGIN
	BEGIN
		PERFORM public.admit_claimed_cycle_trigger(
			(SELECT (payload->0->>'trigger_id')::uuid FROM claimed_cycle_triggers),
			'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
			'{"mode":"scheduled","brief_date":"2026-08-27","timezone":"America/New_York","force_regenerate":false,"use_ontology":true}',
			'{"mode":"evaluate","not_before":"2026-08-27T13:00:00Z"}',
			'2026-08-28T13:00:00Z',
			'2026-08-27T13:00:05Z'
		);
		RAISE EXCEPTION 'expected paused Cycle admission failure';
	EXCEPTION WHEN SQLSTATE '55000' THEN
		IF SQLERRM <> 'cycle_not_active' THEN
			RAISE;
		END IF;
	END;
END;
$$;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.cycle_runs),
	'pausing after lease but before admission must create no Run or queue work'
);
SELECT pg_temp.assert_true(
	public.release_cycle_trigger_claim(
		(SELECT (payload->0->>'trigger_id')::uuid FROM claimed_cycle_triggers),
		'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
	),
	'a paused claimed trigger must remain explicitly releasable after rejected admission'
);

RESET ROLE;
SELECT set_config(
	'request.jwt.claims',
	'{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111"}',
	false
);
DO $$
BEGIN
	BEGIN
		PERFORM public.claim_due_cycle_triggers(
			'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
			'2026-08-27T13:01:00Z'
		);
		RAISE EXCEPTION 'expected internal service-role assertion failure';
	EXCEPTION WHEN insufficient_privilege THEN
		IF SQLERRM <> 'cycle_service_role_required' THEN
			RAISE;
		END IF;
	END;
END;
$$;
SELECT set_config('request.jwt.claims', '', false);

SET ROLE authenticated;
DO $$
BEGIN
	BEGIN
		PERFORM public.release_cycle_trigger_claim(
			(SELECT id FROM public.cycle_triggers LIMIT 1),
			'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
		);
		RAISE EXCEPTION 'expected command privilege failure';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;
RESET ROLE;
