-- supabase/tests/20260826020200_cycle_stale_resume_activation.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.
--
-- REGRESSION CONTRACT. Resuming a Cycle must never
-- make an old materialized next_run_at immediately claimable. A safe
-- implementation may either atomically re-project its schedule or reject the
-- resume and require an explicit activation command with fresh projections.

\set ON_ERROR_STOP on
\ir fixtures/cycle_worker_adversarial_base.sql

CREATE TEMP TABLE activation_clock (activated_at timestamptz NOT NULL);
INSERT INTO activation_clock VALUES (clock_timestamp());
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
	'22222222-2222-4222-8222-222222222222',
	'stale-resume-activation',
	'paused',
	'2020-01-01T14:00:00Z'
);

-- Keep a valid structured schedule whose next real occurrence is well away
-- from the coordinator lead window, regardless of when this test is run.
UPDATE public.cycle_triggers
SET spec = jsonb_set(
	spec,
	'{schedule,time_of_day}',
	to_jsonb(to_char(clock_timestamp() + interval '12 hours', 'HH24:MI'))
)
WHERE cycle_id = '22222222-2222-4222-8222-222222222222';

-- The compatibility command has no DST-aware projection input and therefore
-- must fail closed instead of turning the old date into catch-up work.
DO $$
BEGIN
	BEGIN
		PERFORM public.resume_cycle(
			'11111111-1111-4111-8111-111111111111',
			'22222222-2222-4222-8222-222222222222',
			1
		);
	EXCEPTION WHEN SQLSTATE '55000' THEN
		IF SQLERRM <> 'cycle_trigger_projection_stale' THEN
			RAISE;
		END IF;
	END;
END;
$$;

SELECT pg_temp.expect_true(
	(
		SELECT state = 'paused' AND version = 1
		FROM public.cycles
		WHERE id = '22222222-2222-4222-8222-222222222222'
	),
	'the projection-less compatibility resume did not fail closed'
);

-- The application command supplies a freshly calculated, timezone-safe
-- occurrence. Projection and activation must commit atomically.
SELECT public.resume_cycle(
	'11111111-1111-4111-8111-111111111111',
	'22222222-2222-4222-8222-222222222222',
	1,
	jsonb_build_array(jsonb_build_object(
		'trigger_id', (
			SELECT id
			FROM public.cycle_triggers
			WHERE cycle_id = '22222222-2222-4222-8222-222222222222'
		),
		'next_run_at', (SELECT activated_at + interval '12 hours' FROM activation_clock)
	))
);

SELECT pg_temp.expect_true(
	NOT EXISTS (
		SELECT 1
		FROM public.cycles cycle_row
		JOIN public.cycle_triggers trigger_row ON trigger_row.cycle_id = cycle_row.id
		CROSS JOIN activation_clock activation
		WHERE cycle_row.id = '22222222-2222-4222-8222-222222222222'
			AND cycle_row.state = 'active'
			AND trigger_row.state = 'active'
			AND trigger_row.next_run_at <= activation.activated_at
	),
	'projected resume activated a Cycle with a stale materialized trigger projection'
);

SELECT pg_temp.expect_true(
	jsonb_array_length(public.claim_due_cycle_triggers(
		'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
		(SELECT activated_at FROM activation_clock),
		25,
		120,
		ARRAY['daily_brief']
	)) = 0,
	'the stale resumed trigger was immediately claimable as catch-up work'
);

-- The atomic activation path must reject incomplete projection sets and leave
-- the paused definition untouched.
SELECT pg_temp.create_adversarial_daily_brief_cycle(
	'13333333-3333-4333-8333-333333333333',
	'23333333-3333-4333-8333-333333333333',
	'projection-validation',
	'paused',
	'2020-01-01T14:00:00Z'
);

DO $$
BEGIN
	BEGIN
		PERFORM public.resume_cycle(
			'13333333-3333-4333-8333-333333333333',
			'23333333-3333-4333-8333-333333333333',
			1,
			'[]'::jsonb
		);
		RAISE EXCEPTION 'expected cycle_trigger_projection_invalid';
	EXCEPTION WHEN SQLSTATE '22023' THEN
		IF SQLERRM <> 'cycle_trigger_projection_invalid' THEN
			RAISE;
		END IF;
	END;
END;
$$;

SELECT pg_temp.assert_true(
	(
		SELECT state = 'paused' AND version = 1
		FROM public.cycles
		WHERE id = '23333333-3333-4333-8333-333333333333'
	),
	'a rejected projected resume must not partially activate or version the Cycle'
);

-- A complete fresh set is installed and activated in the same command.
SELECT public.resume_cycle(
	'13333333-3333-4333-8333-333333333333',
	'23333333-3333-4333-8333-333333333333',
	1,
	jsonb_build_array(
		jsonb_build_object(
			'trigger_id', (
			SELECT id
			FROM public.cycle_triggers
			WHERE cycle_id = '23333333-3333-4333-8333-333333333333'
		),
			'next_run_at', (
				SELECT activated_at + interval '1 day'
				FROM activation_clock
			)
		)
	)
);

SELECT pg_temp.assert_true(
	(
		SELECT cycle_row.state = 'active'
			AND cycle_row.version = 2
			AND cycle_row.next_run_at = trigger_row.next_run_at
			AND trigger_row.next_run_at = activation.activated_at + interval '1 day'
		FROM public.cycles cycle_row
		JOIN public.cycle_triggers trigger_row ON trigger_row.cycle_id = cycle_row.id
		CROSS JOIN activation_clock activation
		WHERE cycle_row.id = '23333333-3333-4333-8333-333333333333'
	),
	'projected resume must atomically install the fresh projection and activate the Cycle'
);

DO $$
DECLARE
	v_failures text;
BEGIN
	SELECT string_agg(message, E'\n - ' ORDER BY message)
	INTO v_failures
	FROM adversarial_failures;

	IF v_failures IS NOT NULL THEN
		RAISE EXCEPTION E'adversarial stale-resume contract failed:\n - %', v_failures;
	END IF;
END;
$$;
