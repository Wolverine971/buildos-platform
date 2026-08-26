-- supabase/tests/20260826203546_atomic_cycle_trigger_replacement.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/cycles_v0_foundation_base.sql
\ir ../migrations/20260825211342_add_run_cycle_queue_type.sql
\ir ../migrations/20260825211343_cycles_v0_foundation.sql
\ir ../migrations/20260825211344_cycles_v0_commands.sql
\ir ../migrations/20260826010526_harden_cycle_service_role_wrappers.sql
\ir ../migrations/20260826011409_cycle_due_trigger_coordinator.sql
\ir ../migrations/20260826203546_atomic_cycle_trigger_replacement.sql

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
	('11111111-1111-4111-8111-111111111111', 'Owner', 'owner@example.test'),
	('99999999-9999-4999-8999-999999999999', 'Other', 'other@example.test');

INSERT INTO public.onto_actors (id, user_id) VALUES
	('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111'),
	('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '99999999-9999-4999-8999-999999999999');

SET ROLE service_role;

SELECT public.create_cycle(
	'11111111-1111-4111-8111-111111111111',
	'atomic-trigger-replacement',
	'Daily Brief',
	'daily_brief',
	'user',
	NULL,
	'{}',
	'[{
		"type":"schedule",
		"schedule":{
			"type":"daily",
			"time_of_day":"09:00",
			"timezone":"America/New_York"
		},
		"next_run_at":"2026-08-27T13:00:00Z"
	}]'
);

CREATE TEMP TABLE original_trigger AS
SELECT trigger_row.id
FROM public.cycle_triggers trigger_row
JOIN public.cycles cycle_row ON cycle_row.id = trigger_row.cycle_id
WHERE cycle_row.create_request_id = 'atomic-trigger-replacement';

UPDATE public.cycle_triggers
SET scheduler_claim_token = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
	scheduler_claim_expires_at = now() + interval '5 minutes'
WHERE id = (SELECT id FROM original_trigger);

SELECT public.replace_cycle_triggers(
	'11111111-1111-4111-8111-111111111111',
	(SELECT id FROM public.cycles WHERE create_request_id = 'atomic-trigger-replacement'),
	1,
	'[{
		"type":"schedule",
		"schedule":{
			"type":"weekly",
			"days_of_week":[1,3],
			"time_of_day":"09:30",
			"timezone":"America/New_York"
		},
		"next_run_at":"2026-09-02T13:30:00Z"
	}]'
);

SELECT pg_temp.assert_true(
	(
		SELECT version = 2
			AND next_run_at = '2026-09-02T13:30:00Z'::timestamptz
		FROM public.cycles
		WHERE create_request_id = 'atomic-trigger-replacement'
	),
	'trigger replacement must advance the Cycle version and next-run projection once'
);

SELECT pg_temp.assert_true(
	(
		SELECT state = 'deleted'
			AND deleted_at IS NOT NULL
			AND next_run_at IS NULL
			AND scheduler_claim_token IS NULL
			AND scheduler_claim_expires_at IS NULL
		FROM public.cycle_triggers
		WHERE id = (SELECT id FROM original_trigger)
	),
	'trigger replacement must tombstone the prior trigger and clear any scheduler lease'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
			AND min(trigger_row.trigger_type) = 'schedule'
			AND min(trigger_row.state) = 'active'
			AND min(trigger_row.spec->'schedule'->>'type') = 'weekly'
			AND min(trigger_row.next_run_at) = '2026-09-02T13:30:00Z'::timestamptz
		FROM public.cycle_triggers trigger_row
		JOIN public.cycles cycle_row ON cycle_row.id = trigger_row.cycle_id
		WHERE cycle_row.create_request_id = 'atomic-trigger-replacement'
			AND trigger_row.deleted_at IS NULL
	),
	'trigger replacement must install exactly one validated live trigger'
);

DO $$
BEGIN
	BEGIN
		PERFORM public.replace_cycle_triggers(
			'11111111-1111-4111-8111-111111111111',
			(SELECT id FROM public.cycles WHERE create_request_id = 'atomic-trigger-replacement'),
			1,
			'[{
				"type":"schedule",
				"schedule":{
					"type":"daily",
					"time_of_day":"08:00",
					"timezone":"UTC"
				},
				"next_run_at":"2026-09-03T08:00:00Z"
			}]'
		);
		RAISE EXCEPTION 'expected version conflict';
	EXCEPTION WHEN SQLSTATE 'P0001' THEN
		IF SQLERRM <> 'cycle_version_conflict' THEN
			RAISE;
		END IF;
	END;
END;
$$;

DO $$
BEGIN
	BEGIN
		PERFORM public.replace_cycle_triggers(
			'11111111-1111-4111-8111-111111111111',
			(SELECT id FROM public.cycles WHERE create_request_id = 'atomic-trigger-replacement'),
			2,
			'[{
				"type":"schedule",
				"schedule":{
					"type":"daily",
					"time_of_day":"08:00",
					"timezone":"Not/A_Zone"
				},
				"next_run_at":"2026-09-03T08:00:00Z"
			}]'
		);
		RAISE EXCEPTION 'expected invalid trigger failure';
	EXCEPTION WHEN SQLSTATE '22023' THEN
		IF SQLERRM <> 'cycle_trigger_invalid' THEN
			RAISE;
		END IF;
	END;
END;
$$;

SELECT pg_temp.assert_true(
	(
		SELECT version = 2
			AND next_run_at = '2026-09-02T13:30:00Z'::timestamptz
		FROM public.cycles
		WHERE create_request_id = 'atomic-trigger-replacement'
	) AND (
		SELECT count(*) = 1
		FROM public.cycle_triggers trigger_row
		JOIN public.cycles cycle_row ON cycle_row.id = trigger_row.cycle_id
		WHERE cycle_row.create_request_id = 'atomic-trigger-replacement'
			AND trigger_row.deleted_at IS NULL
	),
	'failed replacements must leave the committed trigger set unchanged'
);

DO $$
BEGIN
	BEGIN
		PERFORM public.replace_cycle_triggers(
			'99999999-9999-4999-8999-999999999999',
			(SELECT id FROM public.cycles WHERE create_request_id = 'atomic-trigger-replacement'),
			2,
			'[{
				"type":"event",
				"event_types":["daily_brief.requested"]
			}]'
		);
		RAISE EXCEPTION 'expected owner mismatch';
	EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
	END;
END;
$$;

RESET ROLE;

SELECT pg_temp.assert_true(
	NOT has_function_privilege('anon', 'public.replace_cycle_triggers(uuid, uuid, integer, jsonb)', 'EXECUTE')
		AND NOT has_function_privilege('authenticated', 'public.replace_cycle_triggers(uuid, uuid, integer, jsonb)', 'EXECUTE')
		AND has_function_privilege('service_role', 'public.replace_cycle_triggers(uuid, uuid, integer, jsonb)', 'EXECUTE'),
	'only service_role may execute the public replacement wrapper'
);

SELECT pg_temp.assert_true(
	NOT has_function_privilege('service_role', 'public.replace_cycle_triggers_impl(uuid, uuid, integer, jsonb)', 'EXECUTE'),
	'the implementation function must remain unreachable to Data API roles'
);
