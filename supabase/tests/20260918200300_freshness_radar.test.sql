-- supabase/tests/20260918200300_freshness_radar.test.sql
-- Tasker 88 Jev freshness radar contract: the per-session debounced turn signal
-- trigger (cohort gate, debounce and cap, dedup key per signal, never breaking
-- the terminal turn write), the suggestion parent/kind checks and one pending
-- bundle per project, the ledger checks, and owner-only RLS with no
-- authenticated writes.
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY. Never run against a linked database.

\set ON_ERROR_STOP on

\ir fixtures/freshness_radar_base.sql
\ir ../migrations/20260914203007_agentic_chat_workflow_v1_storage.sql
\ir ../migrations/20260914203008_agentic_chat_workflow_v1_dispatch_recovery.sql
\ir ../migrations/20260918200000_freshness_radar_ledger.sql
\ir ../migrations/20260918200100_freshness_radar_queue_type.sql
\ir ../migrations/20260918200200_freshness_radar_suggestion_inbox_columns.sql
\ir ../migrations/20260918200300_freshness_radar_turn_signal_trigger.sql

SET client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT COALESCE(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_label text, p_sql text, p_needle text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN
		EXECUTE p_sql;
	EXCEPTION WHEN OTHERS THEN
		IF position(p_needle IN SQLERRM) = 0 THEN
			RAISE EXCEPTION 'assertion_failed: % expected error % got %', p_label, p_needle, SQLERRM;
		END IF;
		RETURN;
	END;
	RAISE EXCEPTION 'assertion_failed: % expected error % but it succeeded', p_label, p_needle;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.id(p_prefix text, p_n integer)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
	SELECT (p_prefix || '000000-0000-4000-8000-' || lpad(p_n::text, 12, '0'))::uuid
$$;

-- Starts a turn and moves it to `completed` (the trigger's only event).
CREATE OR REPLACE FUNCTION pg_temp.complete_turn(
	p_n integer,
	p_session uuid,
	p_user uuid,
	p_project uuid,
	p_message text,
	p_mutation boolean DEFAULT false,
	p_final_status text DEFAULT 'completed'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
	v_turn uuid := pg_temp.id('d4', p_n);
BEGIN
	INSERT INTO public.chat_turn_runs (
		id, session_id, user_id, stream_run_id, context_type, project_id, request_message,
		mutation_reserved_at
	) VALUES (
		v_turn, p_session, p_user, 'stream-' || p_n,
		CASE WHEN p_project IS NULL THEN 'global' ELSE 'project' END,
		p_project, p_message, CASE WHEN p_mutation THEN now() END
	);
	UPDATE public.chat_turn_runs SET status = p_final_status WHERE id = v_turn;
	RETURN v_turn;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.radar_jobs(p_user uuid)
RETURNS integer LANGUAGE sql AS $$
	SELECT count(*)::integer FROM public.queue_jobs
	WHERE user_id = p_user AND job_type = 'freshness_radar_scan'
$$;

-- ---------------------------------------------------------------------------
-- Seed: an owner (cohort), a project member, an outsider, a non-cohort user
-- ---------------------------------------------------------------------------

\set owner 'd1000000-0000-4000-8000-000000000001'
\set member 'd1000000-0000-4000-8000-000000000002'
\set outsider 'd1000000-0000-4000-8000-000000000003'
\set noncohort 'd1000000-0000-4000-8000-000000000004'
\set project 'd3000000-0000-4000-8000-000000000001'
\set project2 'd3000000-0000-4000-8000-000000000002'
\set session 'd2000000-0000-4000-8000-000000000001'

INSERT INTO auth.users (id) SELECT pg_temp.id('d1', n) FROM generate_series(1, 4) AS n;
INSERT INTO public.users (id) SELECT pg_temp.id('d1', n) FROM generate_series(1, 4) AS n;
INSERT INTO public.onto_actors (id, user_id, kind, name)
SELECT pg_temp.id('d5', n), pg_temp.id('d1', n), 'human', 'User ' || n FROM generate_series(1, 4) AS n;
INSERT INTO public.onto_projects (id, name, created_by) VALUES
	(:'project', 'Garden shed rebuild', pg_temp.id('d5', 1)),
	(:'project2', 'Second project', pg_temp.id('d5', 1));
INSERT INTO public.onto_project_members (project_id, actor_id, role_key, access)
VALUES (:'project', pg_temp.id('d5', 2), 'editor', 'write');
INSERT INTO public.chat_sessions (id, user_id, context_type, entity_id)
SELECT pg_temp.id('d2', n), CASE WHEN n = 5 THEN :'noncohort'::uuid ELSE :'owner'::uuid END,
	'project', :'project'
FROM generate_series(1, 5) AS n;
INSERT INTO public.feature_flags (user_id, feature_name, enabled) VALUES
	(:'owner', 'freshness_radar', true),
	(:'noncohort', 'freshness_radar', false);

-- ---------------------------------------------------------------------------
-- Schema shape
-- ---------------------------------------------------------------------------

SELECT pg_temp.assert_true(
	'freshness_radar_scan' = ANY (enum_range(NULL::public.queue_type)::text[]),
	'queue_type has freshness_radar_scan'
);
SELECT pg_temp.assert_true(
	(SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN (
		'public.freshness_radar_signals'::regclass, 'public.freshness_scans'::regclass,
		'public.freshness_flags'::regclass, 'public.freshness_track_scores'::regclass)),
	'radar tables have RLS enabled'
);
SELECT pg_temp.assert_true(
	(SELECT prosecdef AND proconfig @> ARRAY['search_path=pg_catalog, public']
		FROM pg_proc WHERE oid = 'public.enqueue_freshness_radar_signal_v1()'::regprocedure),
	'the trigger function is SECURITY DEFINER with a pinned search_path'
);
SELECT pg_temp.assert_true(
	NOT has_function_privilege('authenticated', 'public.enqueue_freshness_radar_signal_v1()', 'EXECUTE')
		AND NOT has_function_privilege('anon', 'public.enqueue_freshness_radar_signal_v1()', 'EXECUTE'),
	'the trigger function is not executable by clients'
);
SELECT pg_temp.assert_true(NOT EXISTS (
	SELECT 1
	FROM (VALUES ('public.freshness_radar_signals'), ('public.freshness_scans'),
		('public.freshness_flags'), ('public.freshness_track_scores')) AS tables(table_name)
	CROSS JOIN (VALUES ('anon'), ('authenticated')) AS roles(role_name)
	CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS privileges(privilege)
	WHERE has_table_privilege(roles.role_name, tables.table_name, privileges.privilege)
), 'no client role can write radar tables');
SELECT pg_temp.assert_true(
	NOT has_table_privilege('authenticated', 'public.freshness_radar_signals', 'SELECT')
		AND NOT has_table_privilege('anon', 'public.freshness_radar_signals', 'SELECT')
		AND has_table_privilege('authenticated', 'public.freshness_flags', 'SELECT')
		AND NOT has_table_privilege('anon', 'public.freshness_flags', 'SELECT'),
	'signals are service-only; the ledger is readable only by authenticated users'
);
SELECT pg_temp.assert_true(
	(SELECT tgenabled = 'O' FROM pg_trigger
		WHERE tgname = 'trg_chat_turn_runs_freshness_radar'
			AND tgrelid = 'public.chat_turn_runs'::regclass),
	'the turn signal trigger is installed and enabled'
);

-- ---------------------------------------------------------------------------
-- 1. A cohort turn creates one signal and one job
-- ---------------------------------------------------------------------------

SELECT pg_temp.complete_turn(1, pg_temp.id('d2', 1), :'owner', :'project',
	'I finished pouring the concrete footings yesterday; lumber slipped to Oct 3.');

SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 1)),
	'one signal for the session'
);
SELECT pg_temp.assert_true((
	SELECT status = 'pending'
		AND turn_count = 1
		AND last_turn_run_id = pg_temp.id('d4', 1)
		AND project_id_hints = ARRAY[:'project'::uuid]
		AND due_at = first_turn_at + interval '60 seconds'
		AND max_due_at = first_turn_at + interval '10 minutes'
		AND queue_job_id IS NOT NULL
	FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 1)
), 'signal is pending, due 60s after the turn, capped at 10 minutes, and linked to its job');
SELECT pg_temp.assert_true(pg_temp.radar_jobs(:'owner') = 1, 'one queue job');
SELECT pg_temp.assert_true((
	SELECT jobs.dedup_key = 'freshness-radar:' || signals.id
		AND jobs.status = 'pending'
		AND jobs.priority = 9
		AND jobs.scheduled_for = signals.due_at
		AND jobs.id::text = signals.queue_job_id
		AND jobs.metadata->>'signalId' = signals.id::text
		AND jobs.metadata->>'sessionId' = signals.session_id::text
		AND jobs.metadata->>'userId' = signals.user_id::text
		AND jobs.metadata ? 'correlationId'
	FROM public.queue_jobs jobs
	JOIN public.freshness_radar_signals signals ON signals.session_id = pg_temp.id('d2', 1)
	WHERE jobs.job_type = 'freshness_radar_scan'
), 'job is keyed by signal id, scheduled at due_at, with FreshnessScanJobMetadata');

-- ---------------------------------------------------------------------------
-- 2. A second turn moves due_at without a second job (debounce)
-- ---------------------------------------------------------------------------

SELECT due_at AS first_due, queue_job_id AS first_job
FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 1) \gset
SELECT pg_sleep(0.01);
SELECT pg_temp.complete_turn(2, pg_temp.id('d2', 1), :'owner', :'project2',
	'Also the roofing contractor can only start the week after framing is done.');

SELECT pg_temp.assert_true((
	SELECT count(*) = 1 FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 1)
), 'still one signal for the session');
SELECT pg_temp.assert_true((
	SELECT turn_count = 2
		AND due_at > :'first_due'::timestamptz
		AND due_at <= max_due_at
		AND last_turn_run_id = pg_temp.id('d4', 2)
		AND project_id_hints = ARRAY[:'project'::uuid, :'project2'::uuid]
		AND queue_job_id = :'first_job'
	FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 1)
), 'second turn pushes due_at, counts the turn, adds the project hint once, keeps the job');
SELECT pg_temp.assert_true(pg_temp.radar_jobs(:'owner') = 1, 'no second job for the same signal');

-- The debounce never passes the 10-minute cap.
UPDATE public.freshness_radar_signals
SET first_turn_at = now() - interval '9 minutes 50 seconds',
	max_due_at = now() + interval '10 seconds',
	due_at = now() + interval '10 seconds'
WHERE session_id = pg_temp.id('d2', 1);
SELECT pg_temp.complete_turn(3, pg_temp.id('d2', 1), :'owner', :'project',
	'One more thing: the shed door hardware arrived and it is the wrong size again.');
SELECT pg_temp.assert_true((
	SELECT due_at = max_due_at AND turn_count = 3
	FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 1)
), 'due_at is capped at max_due_at');

-- ---------------------------------------------------------------------------
-- 3. Gates: non-cohort, short or unscoped turns, non-completed, workflow turns
-- ---------------------------------------------------------------------------

SELECT pg_temp.complete_turn(10, pg_temp.id('d2', 5), :'noncohort', :'project',
	'A long enough brain dump from someone whose cohort flag is disabled.');
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.freshness_radar_signals WHERE user_id = :'noncohort')
		AND pg_temp.radar_jobs(:'noncohort') = 0,
	'a non-cohort turn does nothing'
);

SELECT pg_temp.complete_turn(11, pg_temp.id('d2', 2), :'owner', :'project', 'ok thanks');
SELECT pg_temp.complete_turn(12, pg_temp.id('d2', 2), :'owner', NULL,
	'A long unscoped question about something general that wrote nothing at all.');
SELECT pg_temp.complete_turn(13, pg_temp.id('d2', 2), :'owner', :'project',
	'This long turn failed instead of completing, so it must not signal.', false, 'failed');
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 2)),
	'short, unscoped read-only, and failed turns do nothing'
);

-- A short or unscoped turn that attempted a write still signals.
SELECT pg_temp.complete_turn(14, pg_temp.id('d2', 2), :'owner', NULL, 'done', true);
SELECT pg_temp.assert_true((
	SELECT turn_count = 1 AND project_id_hints = '{}'::uuid[]
	FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 2)
), 'a write-attempting turn signals even when short and unscoped');

-- A repeated completed status (no transition) does not count again.
UPDATE public.chat_turn_runs SET status = 'completed' WHERE id = pg_temp.id('d4', 14);
SELECT pg_temp.assert_true((
	SELECT turn_count = 1 FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 2)
), 'only the transition into completed fires');

-- Workflow review turns are read-only analysis, never brain dumps.
INSERT INTO public.chat_turn_runs (id, session_id, user_id, stream_run_id, context_type, project_id,
	request_message)
VALUES (pg_temp.id('d4', 15), pg_temp.id('d2', 3), :'owner', 'stream-15', 'project', :'project',
	'Review this project deeply and tell me what is at risk across all milestones.');
SET session_replication_role = replica;
INSERT INTO public.chat_turn_workflow_runs (turn_run_id, session_id, user_id, request_artifact_id,
	project_id, policy, policy_ref, request_hash, max_spend_micro_usd, synthesis_headroom_micro_usd,
	max_physical_dispatches, max_step_attempts, whole_run_lifetime_ms)
VALUES (pg_temp.id('d4', 15), pg_temp.id('d2', 3), :'owner', gen_random_uuid(), :'project',
	'{}'::jsonb, 'policy', repeat('a', 64), 250000, 50000, 8, 2, 900000);
SET session_replication_role = origin;
UPDATE public.chat_turn_runs SET status = 'completed' WHERE id = pg_temp.id('d4', 15);
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 3)),
	'a workflow turn does not signal'
);

-- ---------------------------------------------------------------------------
-- 4. The terminal write always wins when add_queue_job is missing or failing
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
	RENAME TO add_queue_job_disabled_for_test;
SELECT pg_temp.complete_turn(20, pg_temp.id('d2', 4), :'owner', :'project',
	'This dump lands while add_queue_job is missing; the turn must still complete.');
SELECT pg_temp.assert_true(
	(SELECT status = 'completed' FROM public.chat_turn_runs WHERE id = pg_temp.id('d4', 20)),
	'the terminal update commits without add_queue_job'
);
SELECT pg_temp.assert_true(
	NOT EXISTS (SELECT 1 FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 4)),
	'the half-written signal is rolled back with the failed enqueue'
);
ALTER FUNCTION public.add_queue_job_disabled_for_test(uuid, text, jsonb, integer, timestamptz, text)
	RENAME TO add_queue_job;

-- A raising add_queue_job behaves the same.
ALTER FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
	RENAME TO add_queue_job_real_for_test;
CREATE FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text)
RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'queue_unavailable'; END; $$;
SELECT pg_temp.complete_turn(21, pg_temp.id('d2', 4), :'owner', :'project',
	'This dump lands while the queue raises; the turn must still complete cleanly.');
SELECT pg_temp.assert_true(
	(SELECT status = 'completed' FROM public.chat_turn_runs WHERE id = pg_temp.id('d4', 21))
		AND NOT EXISTS (SELECT 1 FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 4)),
	'a raising add_queue_job is demoted to a warning'
);
DROP FUNCTION public.add_queue_job(uuid, text, jsonb, integer, timestamptz, text);
ALTER FUNCTION public.add_queue_job_real_for_test(uuid, text, jsonb, integer, timestamptz, text)
	RENAME TO add_queue_job;

-- The next turn signals normally again.
SELECT pg_temp.complete_turn(22, pg_temp.id('d2', 4), :'owner', :'project',
	'The queue is back; this dump should create a signal and a job as usual.');
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.freshness_radar_signals
		WHERE session_id = pg_temp.id('d2', 4) AND queue_job_id IS NOT NULL),
	'signals resume once add_queue_job is back'
);

-- ---------------------------------------------------------------------------
-- 5. A turn during processing creates a new signal with a new key
-- ---------------------------------------------------------------------------

SELECT id AS processing_signal, queue_job_id AS processing_job
FROM public.freshness_radar_signals WHERE session_id = pg_temp.id('d2', 1) \gset
UPDATE public.freshness_radar_signals SET status = 'processing', started_at = now()
WHERE id = :'processing_signal';
UPDATE public.queue_jobs SET status = 'processing', started_at = now()
WHERE id = :'processing_job'::uuid;
SELECT pg_temp.radar_jobs(:'owner') AS jobs_before \gset

SELECT pg_temp.complete_turn(30, pg_temp.id('d2', 1), :'owner', :'project',
	'While the scan runs I also decided to drop the skylight from the shed plan.');
SELECT pg_temp.assert_true((
	SELECT count(*) = 1 FROM public.freshness_radar_signals
	WHERE session_id = pg_temp.id('d2', 1) AND status = 'pending' AND id <> :'processing_signal'
), 'a new pending signal beside the processing one');
SELECT pg_temp.assert_true(
	pg_temp.radar_jobs(:'owner') = :jobs_before + 1
		AND EXISTS (
			SELECT 1 FROM public.queue_jobs jobs
			JOIN public.freshness_radar_signals signals
				ON jobs.dedup_key = 'freshness-radar:' || signals.id
			WHERE signals.session_id = pg_temp.id('d2', 1) AND signals.status = 'pending'
				AND jobs.status = 'pending'
		),
	'the new signal gets its own job under a new dedup key'
);

-- Service role (the real terminal writer) fires the trigger through SECURITY DEFINER.
SET ROLE service_role;
INSERT INTO public.chat_turn_runs (id, session_id, user_id, stream_run_id, context_type, project_id,
	request_message)
VALUES (pg_temp.id('d4', 31), pg_temp.id('d2', 3), :'owner', 'stream-31', 'project', :'project',
	'Service-role terminal write for a normal brain dump about the shed schedule.');
UPDATE public.chat_turn_runs SET status = 'completed' WHERE id = pg_temp.id('d4', 31);
RESET ROLE;
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.freshness_radar_signals
		WHERE session_id = pg_temp.id('d2', 3) AND last_turn_run_id = pg_temp.id('d4', 31)),
	'a service_role terminal write creates the signal'
);

SELECT pg_temp.expect_error('one pending signal per session',
	format('INSERT INTO public.freshness_radar_signals (session_id, user_id, due_at, max_due_at) VALUES (%L, %L, now(), now())',
		pg_temp.id('d2', 3), :'owner'),
	'freshness_radar_signals_pending_session');
SELECT pg_temp.expect_error('due_at never exceeds max_due_at',
	format('INSERT INTO public.freshness_radar_signals (session_id, user_id, status, due_at, max_due_at) VALUES (%L, %L, ''completed'', now() + interval ''1 hour'', now())',
		pg_temp.id('d2', 3), :'owner'),
	'freshness_radar_signals_due_within_max');

-- ---------------------------------------------------------------------------
-- 6. Scans, ledger checks, suggestion parent/kind checks, one pending bundle
-- ---------------------------------------------------------------------------

INSERT INTO public.freshness_scans (id, project_id, user_id, signal_id, trigger, mode, status,
	question_set_version, question_set_sha256, policy_version, policy)
VALUES (pg_temp.id('d6', 1), :'project', :'owner', :'processing_signal', 'chat_turn', 'live', 'running',
	'freshness_questions_v1', repeat('b', 64), 'freshness_policy_v1', '{}'::jsonb);
SELECT pg_temp.expect_error('one running scan per project',
	format('INSERT INTO public.freshness_scans (project_id, user_id, trigger, mode, question_set_version, question_set_sha256, policy_version, policy) VALUES (%L, %L, ''chat_turn'', ''live'', ''v'', ''s'', ''p'', ''{}'')',
		:'project', :'owner'),
	'freshness_scans_one_running');
SELECT pg_temp.expect_error('one scan per signal and project',
	format('INSERT INTO public.freshness_scans (project_id, user_id, signal_id, trigger, mode, status, question_set_version, question_set_sha256, policy_version, policy) VALUES (%L, %L, %L, ''chat_turn'', ''live'', ''completed'', ''v'', ''s'', ''p'', ''{}'')',
		:'project', :'owner', :'processing_signal'),
	'freshness_scans_signal_project');
UPDATE public.freshness_scans SET status = 'completed', finished_at = now() WHERE id = pg_temp.id('d6', 1);
INSERT INTO public.freshness_scans (id, project_id, user_id, trigger, mode, status,
	question_set_version, question_set_sha256, policy_version, policy)
VALUES (pg_temp.id('d6', 2), :'project', :'member', 'chat_turn', 'live', 'completed',
	'freshness_questions_v1', repeat('b', 64), 'freshness_policy_v1', '{}'::jsonb);

INSERT INTO public.freshness_flags (id, scan_id, project_id, user_id, subject_kind, subject_id,
	subject_title, subject_snapshot, question_set_version, probability, answers, disposition, evidence)
VALUES
	(pg_temp.id('d7', 1), pg_temp.id('d6', 1), :'project', :'owner', 'task', gen_random_uuid(),
		'Pour concrete footings', '{"state_key":"in_progress","title_sha256":"x","details_sha256":null}',
		'freshness_questions_v1', 0.97, '{}', 'drafted',
		'{"excerpt":"I finished pouring the concrete footings yesterday"}'),
	(pg_temp.id('d7', 2), pg_temp.id('d6', 2), :'project', :'member', 'task', gen_random_uuid(),
		'Order door hardware', '{"state_key":"todo","title_sha256":"y","details_sha256":null}',
		'freshness_questions_v1', 0.72, '{}', 'surfaced', '{"excerpt":"member private words"}');
INSERT INTO public.freshness_track_scores (scan_id, project_id, user_id, subject_kind, subject_id,
	subject_title, gauge, answers, facts, question_set_version)
VALUES (pg_temp.id('d6', 1), :'project', :'owner', 'milestone', gen_random_uuid(), 'Shed weather-tight',
	'at_risk', '{}', '[]', 'freshness_questions_v1');

SELECT pg_temp.expect_error('auto-apply without undo is rejected',
	format('INSERT INTO public.freshness_flags (scan_id, project_id, user_id, subject_kind, subject_id, subject_title, subject_snapshot, question_set_version, probability, answers, disposition, applied_via, applied_at, applied_after_updated_at) VALUES (%L, %L, %L, ''task'', gen_random_uuid(), ''t'', ''{}'', ''v'', 0.95, ''{}'', ''auto_applied'', ''auto'', now(), now())',
		pg_temp.id('d6', 1), :'project', :'owner'),
	'freshness_flags_auto_has_undo');
SELECT pg_temp.expect_error('auto-apply without the post-write timestamp is rejected',
	format('INSERT INTO public.freshness_flags (scan_id, project_id, user_id, subject_kind, subject_id, subject_title, subject_snapshot, question_set_version, probability, answers, disposition, applied_via, applied_at, undo_operation) VALUES (%L, %L, %L, ''task'', gen_random_uuid(), ''t'', ''{}'', ''v'', 0.95, ''{}'', ''auto_applied'', ''auto'', now(), ''{}'')',
		pg_temp.id('d6', 1), :'project', :'owner'),
	'freshness_flags_auto_has_undo');
SELECT pg_temp.expect_error('retire without undo is rejected',
	format('INSERT INTO public.freshness_flags (scan_id, project_id, user_id, subject_kind, subject_id, subject_title, subject_snapshot, question_set_version, probability, answers, disposition) VALUES (%L, %L, %L, ''inbox_item'', gen_random_uuid(), ''t'', ''{}'', ''v'', 0.95, ''{}'', ''retired'')',
		pg_temp.id('d6', 1), :'project', :'owner'),
	'freshness_flags_retired_has_undo');
SELECT pg_temp.expect_error('probability stays within [0, 1]',
	format('INSERT INTO public.freshness_flags (scan_id, project_id, user_id, subject_kind, subject_id, subject_title, subject_snapshot, question_set_version, probability, answers, disposition) VALUES (%L, %L, %L, ''task'', gen_random_uuid(), ''t'', ''{}'', ''v'', 1.2, ''{}'', ''evaluated'')',
		pg_temp.id('d6', 1), :'project', :'owner'),
	'freshness_flags_probability_check');
INSERT INTO public.freshness_flags (scan_id, project_id, user_id, subject_kind, subject_id,
	subject_title, subject_snapshot, question_set_version, probability, answers, disposition,
	applied_via, applied_at, applied_after_updated_at, undo_operation)
VALUES (pg_temp.id('d6', 1), :'project', :'owner', 'task', gen_random_uuid(), 'Frame the walls', '{}',
	'freshness_questions_v1', 0.95, '{}', 'auto_applied', 'auto', now(), now(),
	'{"kind":"entity_field","operation":{"tool":"update_onto_task","args":{}},"expectAfterUpdatedAt":"2026-09-18T00:00:00Z"}');
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.freshness_flags WHERE disposition = 'auto_applied'),
	'a complete auto-apply with undo is accepted'
);

-- Existing loop suggestions still satisfy the new parent checks.
INSERT INTO public.project_loop_runs (id, project_id, user_id) VALUES (pg_temp.id('d8', 1), :'project', :'owner');
INSERT INTO public.project_suggestions (id, run_id, project_id, kind, title)
VALUES (pg_temp.id('d9', 1), pg_temp.id('d8', 1), :'project', 'task_conflict', 'Loop suggestion');
INSERT INTO public.project_suggestions (id, run_id, freshness_scan_id, project_id, kind, title,
	chat_session_id, risk_tier, reversible)
VALUES (pg_temp.id('d9', 2), NULL, pg_temp.id('d6', 1), :'project', 'freshness_update',
	'Update 2 out-of-date items', pg_temp.id('d2', 1), 1, true);

SELECT pg_temp.expect_error('a freshness bundle needs its scan',
	format('INSERT INTO public.project_suggestions (run_id, project_id, kind, title) VALUES (%L, %L, ''freshness_update'', ''x'')',
		pg_temp.id('d8', 1), :'project2'),
	'project_suggestions_freshness_parent_check');
SELECT pg_temp.expect_error('a loop suggestion cannot hang off a scan',
	format('INSERT INTO public.project_suggestions (freshness_scan_id, project_id, kind, title) VALUES (%L, %L, ''drift'', ''x'')',
		pg_temp.id('d6', 1), :'project2'),
	'project_suggestions_freshness_parent_check');
SELECT pg_temp.expect_error('exactly one parent: not both',
	format('INSERT INTO public.project_suggestions (run_id, freshness_scan_id, project_id, kind, title) VALUES (%L, %L, %L, ''freshness_update'', ''x'')',
		pg_temp.id('d8', 1), pg_temp.id('d6', 1), :'project2'),
	'project_suggestions_parent_check');
SELECT pg_temp.expect_error('exactly one parent: not neither',
	format('INSERT INTO public.project_suggestions (project_id, kind, title) VALUES (%L, ''drift'', ''x'')',
		:'project2'),
	'project_suggestions_parent_check');
SELECT pg_temp.expect_error('unknown kinds are still rejected',
	format('INSERT INTO public.project_suggestions (run_id, project_id, kind, title) VALUES (%L, %L, ''freshness_whatever'', ''x'')',
		pg_temp.id('d8', 1), :'project2'),
	'project_suggestions_kind_check');

SELECT pg_temp.expect_error('one pending freshness bundle per project',
	format('INSERT INTO public.project_suggestions (freshness_scan_id, project_id, kind, title) VALUES (%L, %L, ''freshness_update'', ''again'')',
		pg_temp.id('d6', 2), :'project'),
	'project_suggestions_one_pending_freshness');
UPDATE public.project_suggestions SET status = 'superseded' WHERE id = pg_temp.id('d9', 2);
INSERT INTO public.project_suggestions (id, freshness_scan_id, project_id, kind, title)
VALUES (pg_temp.id('d9', 3), pg_temp.id('d6', 2), :'project', 'freshness_update', 'Update 1 out-of-date item');
SELECT pg_temp.assert_true(
	(SELECT count(*) = 1 FROM public.project_suggestions
		WHERE project_id = :'project' AND kind = 'freshness_update' AND status = 'pending'),
	'a superseded bundle frees the pending slot'
);

-- Inbox freshness columns.
INSERT INTO public.inbox_items (id, source_type, source_ref_id, project_id, audience, title)
VALUES (pg_temp.id('da', 1), 'project_suggestion', pg_temp.id('d9', 1)::text, :'project',
	'project_members', 'Loop suggestion');
SELECT pg_temp.assert_true((
	SELECT freshness_state = 'fresh' AND freshness_note IS NULL AND freshness_flag_id IS NULL
		AND freshness_checked_at IS NULL
	FROM public.inbox_items WHERE id = pg_temp.id('da', 1)
), 'inbox items default to fresh');
UPDATE public.inbox_items
SET freshness_state = 'possibly_stale', freshness_flag_id = pg_temp.id('d7', 1), freshness_checked_at = now()
WHERE id = pg_temp.id('da', 1);
SELECT pg_temp.expect_error('freshness_state is constrained',
	format('UPDATE public.inbox_items SET freshness_state = ''stale'' WHERE id = %L', pg_temp.id('da', 1)),
	'inbox_items_freshness_state_check');
DELETE FROM public.freshness_flags WHERE id = pg_temp.id('d7', 1);
SELECT pg_temp.assert_true((
	SELECT freshness_flag_id IS NULL AND freshness_state = 'possibly_stale'
	FROM public.inbox_items WHERE id = pg_temp.id('da', 1)
), 'deleting a flag clears the inbox link but keeps the marker');
INSERT INTO public.freshness_flags (id, scan_id, project_id, user_id, subject_kind, subject_id,
	subject_title, subject_snapshot, question_set_version, probability, answers, disposition, evidence)
VALUES (pg_temp.id('d7', 1), pg_temp.id('d6', 1), :'project', :'owner', 'task', gen_random_uuid(),
	'Pour concrete footings', '{"state_key":"in_progress","title_sha256":"x","details_sha256":null}',
	'freshness_questions_v1', 0.97, '{}', 'drafted',
	'{"excerpt":"I finished pouring the concrete footings yesterday"}');

-- ---------------------------------------------------------------------------
-- 7. RLS: the dumping owner reads their own ledger; other members cannot
-- ---------------------------------------------------------------------------

-- Owner.
SELECT set_config('request.jwt.claims',
	json_build_object('sub', :'owner', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) = 2 FROM public.freshness_flags),
	'the owner reads only their own flags (drafted and auto-applied)');
SELECT pg_temp.assert_true(NOT EXISTS (
	SELECT 1 FROM public.freshness_flags WHERE evidence->>'excerpt' = 'member private words'),
	'the owner cannot read the member''s private evidence');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.freshness_scans),
	'the owner reads only their own scans');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.freshness_track_scores),
	'the owner reads their own track scores');
SELECT pg_temp.expect_error('authenticated cannot read signals',
	'SELECT count(*) FROM public.freshness_radar_signals', 'permission denied');
SELECT pg_temp.expect_error('authenticated cannot insert flags',
	format('INSERT INTO public.freshness_flags (scan_id, project_id, user_id, subject_kind, subject_id, subject_title, subject_snapshot, question_set_version, probability, answers, disposition) VALUES (%L, %L, %L, ''task'', gen_random_uuid(), ''t'', ''{}'', ''v'', 0.5, ''{}'', ''evaluated'')',
		pg_temp.id('d6', 1), :'project', :'owner'),
	'permission denied');
SELECT pg_temp.expect_error('authenticated cannot update flags',
	'UPDATE public.freshness_flags SET status = ''dismissed''', 'permission denied');
SELECT pg_temp.expect_error('authenticated cannot delete flags',
	'DELETE FROM public.freshness_flags', 'permission denied');
SELECT pg_temp.expect_error('authenticated cannot write scans',
	'UPDATE public.freshness_scans SET status = ''failed''', 'permission denied');
SELECT pg_temp.expect_error('authenticated cannot write track scores',
	'DELETE FROM public.freshness_track_scores', 'permission denied');
RESET ROLE;

-- Another project member (with write access) sees only their own dump.
SELECT set_config('request.jwt.claims',
	json_build_object('sub', :'member', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT pg_temp.assert_true((
	SELECT count(*) = 1 AND bool_and(user_id = :'member'::uuid) FROM public.freshness_flags
), 'another member cannot read the owner''s flags');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.freshness_scans),
	'another member cannot read the owner''s scans');
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.freshness_track_scores),
	'another member cannot read the owner''s track scores');
RESET ROLE;

-- An outsider sees nothing.
SELECT set_config('request.jwt.claims',
	json_build_object('sub', :'outsider', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT pg_temp.assert_true(
	(SELECT count(*) FROM public.freshness_flags) = 0
		AND (SELECT count(*) FROM public.freshness_scans) = 0,
	'an outsider reads nothing'
);
RESET ROLE;

-- A member who loses project access loses their own ledger too.
UPDATE public.onto_project_members SET removed_at = now()
WHERE project_id = :'project' AND actor_id = pg_temp.id('d5', 2);
SELECT set_config('request.jwt.claims',
	json_build_object('sub', :'member', 'role', 'authenticated')::text, false);
SET ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*) = 0 FROM public.freshness_flags),
	'a removed member can no longer read their own flags');
RESET ROLE;

-- Anonymous callers have no access at all.
SELECT set_config('request.jwt.claims', '{"role":"anon"}', false);
SET ROLE anon;
SELECT pg_temp.expect_error('anon cannot read flags', 'SELECT count(*) FROM public.freshness_flags',
	'permission denied');
RESET ROLE;
SELECT set_config('request.jwt.claims', '', false);

SELECT 'freshness_radar_contract_ok' AS contract;
