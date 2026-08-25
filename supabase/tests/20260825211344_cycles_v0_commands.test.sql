-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on
\ir fixtures/cycles_v0_foundation_base.sql
\ir ../migrations/20260825211342_add_run_cycle_queue_type.sql
\ir ../migrations/20260825211343_cycles_v0_foundation.sql
\ir ../migrations/20260825211344_cycles_v0_commands.sql

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

INSERT INTO public.onto_projects (id, created_by) VALUES
	('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO public.onto_project_members (project_id, actor_id, access) VALUES (
	'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
	'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
	'read'
);

SET ROLE service_role;

SELECT public.create_cycle(
	'11111111-1111-4111-8111-111111111111',
	'create-daily-brief',
	'Daily Brief',
	'daily_brief',
	'user',
	NULL,
	'{}',
	'[{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"America/New_York"},"next_run_at":"2026-08-26T13:00:00Z"}]'
);

SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
			AND min(version) = 1
			AND min(state) = 'active'
			AND min(next_run_at) = '2026-08-26T13:00:00Z'
		FROM public.cycles
		WHERE create_request_id = 'create-daily-brief'
	),
	'create_cycle must atomically create an active definition and its next-run projection'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.cycle_triggers trigger_row
		JOIN public.cycles cycle_row ON cycle_row.id = trigger_row.cycle_id
		WHERE cycle_row.create_request_id = 'create-daily-brief'
			AND trigger_row.spec->>'type' = 'schedule'
	),
	'create_cycle must persist initial triggers in the same transaction'
);

SELECT public.create_cycle(
	'11111111-1111-4111-8111-111111111111',
	'create-daily-brief',
	'Daily Brief',
	'daily_brief',
	'user',
	NULL,
	'{}',
	'[{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"America/New_York"},"next_run_at":"2026-08-27T13:00:00Z"}]'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
	'a repeated create request ID must resolve to the existing Cycle'
);

DO $$
BEGIN
	BEGIN
		PERFORM public.create_cycle(
			'11111111-1111-4111-8111-111111111111',
			'create-daily-brief',
			'Conflicting replay',
			'daily_brief',
			'user',
			NULL,
			'{}',
			'[{"type":"event","event_types":["daily_brief.requested"]}]'
		);
		RAISE EXCEPTION 'expected create request conflict';
	EXCEPTION WHEN SQLSTATE '22023' THEN
		IF SQLERRM <> 'cycle_create_request_conflict' THEN
			RAISE;
		END IF;
	END;
END;
$$;

DO $$
BEGIN
	BEGIN
		PERFORM public.create_cycle(
			'11111111-1111-4111-8111-111111111111',
			'duplicate-target',
			'Another Daily Brief',
			'daily_brief',
			'user',
			NULL,
			'{}',
			'[{"type":"event","event_types":["daily_brief.requested"]}]'
		);
		RAISE EXCEPTION 'expected duplicate target failure';
	EXCEPTION WHEN unique_violation THEN
		IF SQLERRM <> 'cycle_already_exists_for_target' THEN
			RAISE;
		END IF;
	END;
END;
$$;

DO $$
BEGIN
	BEGIN
		PERFORM public.create_cycle(
			'11111111-1111-4111-8111-111111111111',
			'fractional-attempts',
			'Invalid policy',
			'task_review',
			'user',
			NULL,
			'{}',
			'[]',
			'{"overlap":"skip","misfire":"run_once","max_attempts":2.5}'
		);
		RAISE EXCEPTION 'expected fractional policy failure';
	EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
	END;
END;
$$;

DO $$
BEGIN
	BEGIN
		PERFORM public.create_cycle(
			'11111111-1111-4111-8111-111111111111',
			'invalid-timezone',
			'Invalid trigger',
			'task_review',
			'user',
			NULL,
			'{}',
			'[{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"Not/A_Zone"},"next_run_at":"2026-08-26T13:00:00Z"}]'
		);
		RAISE EXCEPTION 'expected trigger validation failure';
	EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
	END;
END;
$$;

SELECT public.update_cycle(
	'11111111-1111-4111-8111-111111111111',
	(SELECT id FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
	1,
	'{"label":"Morning Orientation","policy":{"overlap":"skip","misfire":"run_once","max_attempts":4}}'
);
SELECT pg_temp.assert_true(
	(
		SELECT label = 'Morning Orientation'
			AND version = 2
			AND policy->>'max_attempts' = '4'
		FROM public.cycles
		WHERE create_request_id = 'create-daily-brief'
	),
	'update_cycle must validate and increment the definition version exactly once'
);

DO $$
BEGIN
	BEGIN
		PERFORM public.update_cycle(
			'11111111-1111-4111-8111-111111111111',
			(SELECT id FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
			1,
			'{"label":"Stale writer"}'
		);
		RAISE EXCEPTION 'expected version conflict';
	EXCEPTION WHEN SQLSTATE 'P0001' THEN
		IF SQLERRM <> 'cycle_version_conflict' THEN
			RAISE;
		END IF;
	END;
END;
$$;

SELECT public.pause_cycle(
	'11111111-1111-4111-8111-111111111111',
	(SELECT id FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
	2
);
SELECT pg_temp.assert_true(
	(SELECT state = 'paused' AND version = 3 FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
	'pause_cycle must use the same compare-and-swap version contract'
);

DO $$
BEGIN
	BEGIN
		PERFORM public.admit_manual_cycle_run(
			'11111111-1111-4111-8111-111111111111',
			(SELECT id FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
			'manual-while-paused',
			'{"mode":"manual","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
			'{"mode":"suppress","reason":"manual_run"}'
		);
		RAISE EXCEPTION 'expected paused admission failure';
	EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
	END;
END;
$$;

SELECT public.resume_cycle(
	'11111111-1111-4111-8111-111111111111',
	(SELECT id FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
	3
);
SELECT pg_temp.assert_true(
	(SELECT state = 'active' AND version = 4 FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
	'resume_cycle must use the same compare-and-swap version contract'
);

SELECT public.admit_manual_cycle_run(
	'11111111-1111-4111-8111-111111111111',
	(SELECT id FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
	'manual-run-1',
	'{"mode":"manual","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
	'{"mode":"suppress","reason":"manual_run"}'
);
DO $$
BEGIN
	BEGIN
		PERFORM public.admit_manual_cycle_run(
			'11111111-1111-4111-8111-111111111111',
			(SELECT id FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
			'manual-run-1',
			'{"mode":"manual","brief_date":"2026-08-26","timezone":"America/New_York","force_regenerate":false}',
			'{"mode":"suppress","reason":"manual_run"}'
		);
		RAISE EXCEPTION 'expected manual occurrence conflict';
	EXCEPTION WHEN SQLSTATE '22023' THEN
		IF SQLERRM <> 'cycle_occurrence_conflict' THEN
			RAISE;
		END IF;
	END;
END;
$$;
SELECT public.admit_manual_cycle_run(
	'11111111-1111-4111-8111-111111111111',
	(SELECT id FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
	'manual-run-1',
	'{"mode":"manual","brief_date":"2026-08-25","timezone":"America/New_York","force_regenerate":false}',
	'{"mode":"suppress","reason":"manual_run"}'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.cycle_runs
		WHERE occurrence_key = 'manual:manual-run-1'
	),
	'manual Run request retries must create one immutable Cycle Run'
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 1
		FROM public.queue_jobs
		WHERE dedup_key LIKE 'cycle-run:%'
	),
	'manual Run request retries must create one queue job'
);
SET ROLE service_role;

DO $$
BEGIN
	BEGIN
		PERFORM public.admit_manual_cycle_run(
			'99999999-9999-4999-8999-999999999999',
			(SELECT id FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
			'cross-owner-run',
			'{}',
			'{"mode":"suppress","reason":"test"}'
		);
		RAISE EXCEPTION 'expected owner mismatch failure';
	EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
	END;
END;
$$;

SELECT public.create_cycle(
	'11111111-1111-4111-8111-111111111111',
	'owner-project-audit',
	'Project Audit',
	'project_audit',
	'project',
	'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
	'{"depth":"standard"}',
	'[{"type":"event","event_types":["project.changed"],"debounce_minutes":10}]',
	'{"overlap":"skip","misfire":"run_once","max_attempts":3}',
	'exceptions',
	'paused'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.cycles WHERE create_request_id = 'owner-project-audit'),
	'a project owner may create a project-targeted Cycle'
);

DO $$
BEGIN
	BEGIN
		PERFORM public.create_cycle(
			'99999999-9999-4999-8999-999999999999',
			'read-member-project-review',
			'Project Review',
			'project_review',
			'project',
			'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
			'{}',
			'[{"type":"event","event_types":["project.review.requested"]}]',
			'{"overlap":"skip","misfire":"run_once","max_attempts":3}',
			'exceptions',
			'paused'
		);
		RAISE EXCEPTION 'expected project write-access failure';
	EXCEPTION WHEN insufficient_privilege THEN
		IF SQLERRM <> 'cycle_project_access_denied' THEN
			RAISE;
		END IF;
	END;
END;
$$;

RESET ROLE;
UPDATE public.onto_project_members
SET access = 'write'
WHERE actor_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE service_role;

SELECT public.create_cycle(
	'99999999-9999-4999-8999-999999999999',
	'write-member-project-review',
	'Project Review',
	'project_review',
	'project',
	'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
	'{}',
	'[{"type":"event","event_types":["project.review.requested"]}]',
	'{"overlap":"skip","misfire":"run_once","max_attempts":3}',
	'exceptions',
	'paused'
);
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.cycles WHERE create_request_id = 'write-member-project-review'),
	'a project member with write access may create a project-targeted Cycle'
);

RESET ROLE;
UPDATE public.onto_project_members
SET access = 'read'
WHERE actor_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
SET ROLE service_role;
DO $$
BEGIN
	BEGIN
		PERFORM public.resume_cycle(
			'99999999-9999-4999-8999-999999999999',
			(SELECT id FROM public.cycles WHERE create_request_id = 'write-member-project-review'),
			1
		);
		RAISE EXCEPTION 'expected resume access failure';
	EXCEPTION WHEN insufficient_privilege THEN
		IF SQLERRM <> 'cycle_project_access_denied' THEN
			RAISE;
		END IF;
	END;
END;
$$;

SELECT public.delete_cycle(
	'11111111-1111-4111-8111-111111111111',
	(SELECT id FROM public.cycles WHERE create_request_id = 'create-daily-brief'),
	4
);
RESET ROLE;
SELECT pg_temp.assert_true(
	(
		SELECT state = 'deleted' AND version = 5 AND deleted_at IS NOT NULL AND next_run_at IS NULL
		FROM public.cycles
		WHERE create_request_id = 'create-daily-brief'
	),
	'delete_cycle must tombstone the definition and preserve history'
);
SELECT pg_temp.assert_true(
	(
		SELECT bool_and(
			trigger_row.state = 'deleted'
			AND trigger_row.deleted_at IS NOT NULL
			AND trigger_row.next_run_at IS NULL
		)
		FROM public.cycle_triggers trigger_row
		JOIN public.cycles cycle_row ON cycle_row.id = trigger_row.cycle_id
		WHERE cycle_row.create_request_id = 'create-daily-brief'
	),
	'delete_cycle must tombstone all live triggers'
);
SELECT pg_temp.assert_true(
	(
		SELECT status = 'cancelled' AND finished_at IS NOT NULL
		FROM public.cycle_runs
		WHERE occurrence_key = 'manual:manual-run-1'
	),
	'delete_cycle must cancel admitted work that has not started'
);
SELECT pg_temp.assert_true(
	(
		SELECT queue_row.status = 'cancelled'
		FROM public.queue_jobs queue_row
		JOIN public.cycle_runs run ON run.queue_job_record_id = queue_row.id
		WHERE run.occurrence_key = 'manual:manual-run-1'
	),
	'delete_cycle must cancel pending queue transport for cancelled Runs'
);

SET ROLE service_role;
SELECT public.create_cycle(
	'11111111-1111-4111-8111-111111111111',
	'replacement-daily-brief',
	'Replacement Daily Brief',
	'daily_brief',
	'user',
	NULL,
	'{}',
	'[{"type":"schedule","schedule":{"type":"daily","time_of_day":"09:00","timezone":"America/New_York"},"state":"paused","next_run_at":null}]',
	'{"overlap":"skip","misfire":"run_once","max_attempts":3}',
	'always',
	'paused'
);
SELECT pg_temp.assert_true(
	(
		SELECT count(*) = 2
		FROM public.cycles
		WHERE user_id = '11111111-1111-4111-8111-111111111111'
			AND kind = 'daily_brief'
	),
	'a tombstone must preserve history while allowing a replacement definition'
);

RESET ROLE;
SET ROLE authenticated;
DO $$
BEGIN
	BEGIN
		PERFORM public.create_cycle(
			'99999999-9999-4999-8999-999999999999',
			'unauthorized-create',
			'Unauthorized',
			'task_review',
			'user',
			NULL,
			'{}',
			'[]'
		);
		RAISE EXCEPTION 'expected command privilege failure';
	EXCEPTION WHEN insufficient_privilege THEN NULL;
	END;
END;
$$;
RESET ROLE;
