-- supabase/tests/20261017170000_project_fold_v1_readiness.check.sql
-- Rehearsal check for 20261017170000_project_fold_v1_readiness.sql (after the two
-- 20260930220000 / 20260930220100 fold files):
--   pnpm db:rehearse supabase/migrations/20260930220000_project_fold_foundation.sql \
--     supabase/migrations/20260930220100_project_unfold.sql \
--     supabase/migrations/20261017170000_project_fold_v1_readiness.sql \
--     --check supabase/tests/20260930220000_project_fold.check.sql \
--     --check supabase/tests/20261017170000_project_fold_v1_readiness.check.sql
-- Proves: ended standalone events stay with the archived source and do not block;
-- upcoming, under-way and recurring ones block and are listed; links, attachments
-- and moving owners that tie an ended event to moved work block; task entities follow
-- their task through fold and unfold without queueing a paid re-read; the table policy
-- has no gaps. DISPOSABLE DATABASE ONLY. All fixtures are invented; everything rolls back.

\set ON_ERROR_STOP on

ALTER ROLE service_role BYPASSRLS;
BEGIN;

CREATE TEMP TABLE results (key text PRIMARY KEY, value jsonb) ON COMMIT DROP;
GRANT ALL ON results TO service_role;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_condition boolean, p_message text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	IF NOT coalesce(p_condition, false) THEN
		RAISE EXCEPTION 'assertion_failed: %', p_message;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_raises(p_sql text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
	BEGIN
		EXECUTE p_sql;
	EXCEPTION WHEN OTHERS THEN
		IF position(p_expected IN SQLERRM) > 0 THEN
			RETURN;
		END IF;
		RAISE EXCEPTION 'assertion_failed: expected "%" from [%], got "%"', p_expected, p_sql, SQLERRM;
	END;
	RAISE EXCEPTION 'assertion_failed: expected "%" from [%], but it succeeded', p_expected, p_sql;
END;
$$;

-- Service-role calls, the way the worker bridge makes them.
CREATE OR REPLACE FUNCTION pg_temp.fold_preview(p_user uuid, p_source uuid, p_dest uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
	PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
	SET LOCAL ROLE service_role;
	v := public.onto_project_fold_preview(p_user, p_source, p_dest, '{}');
	RESET ROLE;
	RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.fold_apply(p_user uuid, p_source uuid, p_dest uuid, p_token text, p_fold uuid)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
	PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
	SET LOCAL ROLE service_role;
	v := public.onto_project_fold_apply(p_user, p_source, p_dest, p_token, p_fold, '{}');
	RESET ROLE;
	RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.unfold_preview(p_user uuid, p_fold uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
	PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
	SET LOCAL ROLE service_role;
	v := public.onto_project_unfold_preview(p_user, p_fold);
	RESET ROLE;
	RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.unfold_apply(p_user uuid, p_fold uuid, p_token text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE v jsonb;
BEGIN
	PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
	SET LOCAL ROLE service_role;
	v := public.onto_project_unfold_apply(p_user, p_fold, p_token);
	RESET ROLE;
	RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION pg_temp.blockers(p_preview jsonb) RETURNS text[]
LANGUAGE sql AS $$ SELECT ARRAY(SELECT jsonb_array_elements_text(p_preview->'impact'->'blockers') ORDER BY 1) $$;
CREATE OR REPLACE FUNCTION pg_temp.listed_ids(p_list jsonb) RETURNS text[]
LANGUAGE sql AS $$ SELECT ARRAY(SELECT e->>'id' FROM jsonb_array_elements(p_list) WITH ORDINALITY AS x(e, n) ORDER BY n) $$;
CREATE OR REPLACE FUNCTION pg_temp.extract_jobs(p_task uuid) RETURNS bigint
LANGUAGE sql AS $$ SELECT count(*) FROM public.queue_jobs WHERE job_type = 'extract_task_entities' AND metadata->>'taskId' = p_task::text $$;

-- ---------------------------------------------------------------------------
-- Fixtures. A owns Ops (S, the source) and Internal (D, the destination).
-- ids: users a5.., actors b5.., projects c5.., tasks e5.., goals f5..,
-- events 15.., edges 25.., comments 35.., task entities 45.., assets 55..

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('a5000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
	'fold-ready-a@example.test', '', now(), now(), now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email) VALUES ('a5000000-0000-4000-8000-000000000001', 'fold-ready-a@example.test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.onto_actors (id, user_id, kind, name)
SELECT 'b5000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'human', 'Ash'
WHERE NOT EXISTS (SELECT 1 FROM public.onto_actors WHERE user_id = 'a5000000-0000-4000-8000-000000000001');

INSERT INTO public.onto_projects (id, name, type_key, created_by, doc_structure) VALUES
	('c5000000-0000-4000-8000-000000000001', 'Ops', 'project.base', 'b5000000-0000-4000-8000-000000000001', '{"version":1,"root":[]}'),
	('c5000000-0000-4000-8000-000000000002', 'Internal', 'project.base', 'b5000000-0000-4000-8000-000000000001', '{"version":1,"root":[]}');

INSERT INTO public.onto_tasks (id, project_id, title, description, start_at, created_by) VALUES
	('e5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'Call Pat', 'Pat at 555-0100', NULL, 'b5000000-0000-4000-8000-000000000001'),
	('e5000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000001', 'Draft brief', NULL, now() + interval '3 days', 'b5000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_goals (id, project_id, name, type_key, created_by) VALUES
	('f5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'Ship the series', 'goal.default', 'b5000000-0000-4000-8000-000000000001');

-- Three ended standalone events (one synced from Google), and one task event.
INSERT INTO public.onto_events (id, project_id, owner_entity_type, owner_entity_id, type_key, title, start_at, end_at,
	sync_status, last_synced_at, props, created_by) VALUES
	('15000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'project', 'c5000000-0000-4000-8000-000000000001',
		'event.default', 'Kickoff call', now() - interval '10 days', now() - interval '10 days' + interval '1 hour',
		'synced', now() - interval '10 days', '{"google_event_id":"g-kickoff"}', 'b5000000-0000-4000-8000-000000000001'),
	('15000000-0000-4000-8000-000000000002', 'c5000000-0000-4000-8000-000000000001', 'standalone', NULL,
		'event.default', 'Recorded session', now() - interval '3 days', NULL,
		'pending', NULL, '{}', 'b5000000-0000-4000-8000-000000000001'),
	('15000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000001', 'project', 'c5000000-0000-4000-8000-000000000001',
		'event.default', 'Old review', now() - interval '30 days', now() - interval '30 days' + interval '30 minutes',
		'synced', now() - interval '30 days', '{}', 'b5000000-0000-4000-8000-000000000001'),
	('15000000-0000-4000-8000-000000000010', 'c5000000-0000-4000-8000-000000000001', 'task', 'e5000000-0000-4000-8000-000000000002',
		'event.task_work', 'Draft brief', now() + interval '3 days', NULL,
		'synced', now(), '{}', 'b5000000-0000-4000-8000-000000000001');

INSERT INTO public.onto_edges (id, project_id, src_kind, src_id, dst_kind, dst_id, rel) VALUES
	-- Moves with both ends.
	('25000000-0000-4000-8000-000000000003', 'c5000000-0000-4000-8000-000000000001', 'task', 'e5000000-0000-4000-8000-000000000001', 'goal', 'f5000000-0000-4000-8000-000000000001', 'supports'),
	-- Touches the rebuilt task event and an ended event: dropped with the task event (no block).
	('25000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000001', 'event', '15000000-0000-4000-8000-000000000010', 'event', '15000000-0000-4000-8000-000000000001', 'related'),
	('25000000-0000-4000-8000-000000000005', 'c5000000-0000-4000-8000-000000000001', 'task', 'e5000000-0000-4000-8000-000000000002', 'event', '15000000-0000-4000-8000-000000000010', 'has_event');
INSERT INTO public.onto_comments (id, project_id, entity_type, entity_id, body, created_by) VALUES
	('35000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'event', '15000000-0000-4000-8000-000000000001', 'Notes from the kickoff', 'b5000000-0000-4000-8000-000000000001');

-- Task entities and extraction state for "Call Pat" (normally written by the worker).
INSERT INTO public.onto_task_entities (id, task_id, project_id, kind, natural_key, value, display, status) VALUES
	('45000000-0000-4000-8000-000000000001', 'e5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'phone', '+15555550100', '+15555550100', '555-0100', 'suggested'),
	('45000000-0000-4000-8000-000000000002', 'e5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'person', 'pat', 'Pat', 'Pat', 'confirmed');
INSERT INTO public.onto_task_entity_state (task_id, project_id, source_hash, extractor_version, outcome, entity_count) VALUES
	('e5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', md5('Call Pat' || chr(31) || 'Pat at 555-0100'), 1, 'extracted', 2);
INSERT INTO results VALUES ('extract_jobs_before', to_jsonb(pg_temp.extract_jobs('e5000000-0000-4000-8000-000000000001'))),
	('extract_jobs_before_2', to_jsonb(pg_temp.extract_jobs('e5000000-0000-4000-8000-000000000002')));

-- A schema-only snapshot has no rows: seed Organize's rollout singleton (data in
-- production, inserted by 20260930170110), then turn both flags on.
INSERT INTO private.organize_rollout (singleton) SELECT true WHERE NOT EXISTS (SELECT 1 FROM private.organize_rollout);
UPDATE private.organize_rollout SET calendar_sync_ready = true, asset_access_ready = true WHERE singleton;

-- ---------------------------------------------------------------------------
-- 1. Coverage: no gaps; task entities are classified move and implemented; the
--    events policy states the new rule.

SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM private.project_fold_policy_gaps()),
	'policy covers every project column: ' || coalesce((SELECT string_agg(problem || ' ' || table_name || '.' || column_name, ', ') FROM private.project_fold_policy_gaps()), ''));
SELECT pg_temp.assert_true(
	(SELECT count(*) = 2 FROM private.project_fold_table_policy WHERE table_schema = 'public' AND column_name = 'project_id' AND action = 'move'
		AND table_name IN ('onto_task_entities', 'onto_task_entity_state'))
	AND (SELECT count(*) = 2 FROM private.project_fold_implemented() WHERE action = 'move'
		AND table_name IN ('onto_task_entities', 'onto_task_entity_state'))
	AND (SELECT action = 'rebuild' AND reason LIKE '%Standalone events that have ended%' FROM private.project_fold_table_policy
		WHERE table_schema = 'public' AND table_name = 'onto_events' AND column_name = 'project_id'),
	'task entities are classified move and implemented; the onto_events reason describes the ended-event rule');
SELECT pg_temp.assert_true(
	NOT has_function_privilege('authenticated', 'private.project_fold_prepare(uuid,uuid,uuid,uuid[],boolean)', 'EXECUTE')
	AND NOT has_function_privilege('anon', 'private.project_fold_prepare(uuid,uuid,uuid,uuid[],boolean)', 'EXECUTE')
	AND NOT has_function_privilege('authenticated', 'private.project_fold_implemented()', 'EXECUTE')
	AND has_function_privilege('service_role', 'private.project_fold_prepare(uuid,uuid,uuid,uuid[],boolean)', 'EXECUTE')
	AND (SELECT NOT prosecdef AND proconfig = ARRAY['search_path=""'] FROM pg_proc WHERE oid = 'private.project_fold_prepare(uuid,uuid,uuid,uuid[],boolean)'::regprocedure),
	'replaced functions stay server-only, invoker, search_path empty');

-- ---------------------------------------------------------------------------
-- 2. Ended standalone events stay with the source and do not block.

INSERT INTO results VALUES ('p1', pg_temp.fold_preview('a5000000-0000-4000-8000-000000000001',
	'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000002'));
SELECT pg_temp.assert_true((SELECT pg_temp.blockers(value) = '{}'
		AND (value->'impact'->'counts'->>'past_events_left_with_source')::int = 3
		AND (value->'impact'->'counts'->>'upcoming_standalone_events')::int = 0
		AND (value->'impact'->'counts'->>'other_live_events')::int = 3
		AND (value->'impact'->'counts'->>'task_events_rebuilt')::int = 1
		AND (value->'impact'->'counts'->>'task_event_links_dropped')::int = 2
		AND (value->'impact'->'counts'->>'past_event_links')::int = 0
		AND (value->'impact'->'counts'->>'onto_edges')::int = 1
		AND pg_temp.listed_ids(value->'impact'->'past_events_left_with_source') = ARRAY['15000000-0000-4000-8000-000000000002',
			'15000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000003']
		AND (SELECT bool_and(e ?& ARRAY['id', 'title', 'start_at'] AND (SELECT count(*) FROM jsonb_object_keys(e)) = 3)
			FROM jsonb_array_elements(value->'impact'->'past_events_left_with_source') e)
		AND value->'impact'->'past_events_left_with_source'->0->>'title' = 'Recorded session'
		AND value->'impact'->'upcoming_standalone_events' = '[]'::jsonb
		AND (value->'info'->>'task_entities_moved')::int = 2
	FROM results WHERE key = 'p1'),
	'ended events are reported, listed most recent first, and do not block: ' || (SELECT (value->'impact')::text FROM results WHERE key = 'p1'));

-- The token is deterministic: a second preview and Google sync churn on an ended
-- event leave it unchanged; no clock value is in the impact.
UPDATE public.onto_events SET sync_status = 'synced', last_synced_at = now(), props = props || '{"etag":"2"}'
WHERE id = '15000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT pg_temp.fold_preview('a5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
		'c5000000-0000-4000-8000-000000000002')->'confirmation_token' = value->'confirmation_token'
		AND position((to_jsonb(now())#>>'{}') IN (value->'impact')::text) = 0
	FROM results WHERE key = 'p1'),
	'the preview token is stable for an unchanged project and carries no clock value');

-- ---------------------------------------------------------------------------
-- 3. Upcoming and under-way standalone events block and are listed by name.

SAVEPOINT upcoming;
INSERT INTO public.onto_events (id, project_id, owner_entity_type, owner_entity_id, type_key, title, start_at, end_at, created_by) VALUES
	('15000000-0000-4000-8000-000000000004', 'c5000000-0000-4000-8000-000000000001', 'project', 'c5000000-0000-4000-8000-000000000001',
		'event.default', 'Client call', now() + interval '5 days', now() + interval '5 days' + interval '1 hour', 'b5000000-0000-4000-8000-000000000001'),
	('15000000-0000-4000-8000-000000000005', 'c5000000-0000-4000-8000-000000000001', 'project', 'c5000000-0000-4000-8000-000000000001',
		'event.default', 'Workshop', now() - interval '1 hour', now() + interval '1 hour', 'b5000000-0000-4000-8000-000000000001');
INSERT INTO results VALUES ('p_upcoming', pg_temp.fold_preview('a5000000-0000-4000-8000-000000000001',
	'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000002'));
SELECT pg_temp.assert_true((SELECT pg_temp.blockers(value) = ARRAY['standalone_events_not_supported']
		AND (value->'impact'->'counts'->>'upcoming_standalone_events')::int = 2
		AND (value->'impact'->'counts'->>'past_events_left_with_source')::int = 3
		AND value->'impact'->'upcoming_standalone_events' = jsonb_build_array(
			jsonb_build_object('id', '15000000-0000-4000-8000-000000000005', 'title', 'Workshop', 'start_at', now() - interval '1 hour'),
			jsonb_build_object('id', '15000000-0000-4000-8000-000000000004', 'title', 'Client call', 'start_at', now() + interval '5 days'))
	FROM results WHERE key = 'p_upcoming'),
	'upcoming and under-way events block and are named, soonest first: ' || (SELECT (value->'impact')::text FROM results WHERE key = 'p_upcoming'));
SELECT pg_temp.assert_raises(format($q$SELECT pg_temp.fold_apply('a5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',%L,'f5000000-0000-4000-8000-0000000000f9')$q$,
	(SELECT value->>'confirmation_token' FROM results WHERE key = 'p_upcoming')), 'standalone_events_not_supported');
ROLLBACK TO SAVEPOINT upcoming;

-- A recurring event that started in the past still blocks (it may recur) and is
-- listed as upcoming, not left behind.
SAVEPOINT recurring;
INSERT INTO public.onto_events (id, project_id, owner_entity_type, owner_entity_id, type_key, title, start_at, end_at, recurrence, created_by) VALUES
	('15000000-0000-4000-8000-000000000006', 'c5000000-0000-4000-8000-000000000001', 'project', 'c5000000-0000-4000-8000-000000000001',
		'event.default', 'Weekly sync', now() - interval '20 days', now() - interval '20 days' + interval '1 hour',
		'{"rrule":"RRULE:FREQ=WEEKLY"}', 'b5000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true((SELECT pg_temp.blockers(v) = ARRAY['recurring_event_not_supported', 'standalone_events_not_supported']
		AND pg_temp.listed_ids(v->'impact'->'upcoming_standalone_events') = ARRAY['15000000-0000-4000-8000-000000000006']
		AND (v->'impact'->'counts'->>'past_events_left_with_source')::int = 3
	FROM (SELECT pg_temp.fold_preview('a5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
		'c5000000-0000-4000-8000-000000000002') AS v) x),
	'a recurring event blocks and is listed as upcoming');
ROLLBACK TO SAVEPOINT recurring;

-- ---------------------------------------------------------------------------
-- 4. Anything that would tie an ended event to moved work blocks: a link, an
--    attachment, a moving owner.

SAVEPOINT event_links;
INSERT INTO public.onto_edges (id, project_id, src_kind, src_id, dst_kind, dst_id, rel) VALUES
	('25000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001', 'task', 'e5000000-0000-4000-8000-000000000001', 'event', '15000000-0000-4000-8000-000000000001', 'references');
INSERT INTO results VALUES ('p_link', pg_temp.fold_preview('a5000000-0000-4000-8000-000000000001',
	'c5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000002'));
SELECT pg_temp.assert_true((SELECT pg_temp.blockers(value) = ARRAY['event_links_not_supported']
		AND (value->'impact'->'counts'->>'past_event_links')::int = 1
	FROM results WHERE key = 'p_link'),
	'a link from a moving task to an ended event blocks: ' || (SELECT (value->'impact'->'counts')::text FROM results WHERE key = 'p_link'));
SELECT pg_temp.assert_raises(format($q$SELECT pg_temp.fold_apply('a5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002',%L,'f5000000-0000-4000-8000-0000000000f8')$q$,
	(SELECT value->>'confirmation_token' FROM results WHERE key = 'p_link')), 'event_links_not_supported');
SELECT pg_temp.assert_true((SELECT project_id = 'c5000000-0000-4000-8000-000000000001' FROM public.onto_edges WHERE id = '25000000-0000-4000-8000-000000000001'),
	'the refused apply moved nothing');
ROLLBACK TO SAVEPOINT event_links;

SAVEPOINT event_attachment;
INSERT INTO public.onto_assets (id, project_id, storage_path, content_type, file_size_bytes, created_by) VALUES
	('55000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
		'projects/c5000000-0000-4000-8000-000000000001/assets/55000000-0000-4000-8000-000000000001/original.png', 'image/png', 100, 'b5000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_asset_links (project_id, asset_id, entity_kind, entity_id, created_by) VALUES
	('c5000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'event', '15000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001');
INSERT INTO public.onto_events (id, project_id, owner_entity_type, owner_entity_id, type_key, title, start_at, end_at, created_by) VALUES
	('15000000-0000-4000-8000-000000000007', 'c5000000-0000-4000-8000-000000000001', 'goal', 'f5000000-0000-4000-8000-000000000001',
		'event.default', 'Goal check-in', now() - interval '6 days', now() - interval '6 days' + interval '1 hour', 'b5000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true((SELECT pg_temp.blockers(v) = ARRAY['event_links_not_supported']
		AND (v->'impact'->'counts'->>'past_event_attachments')::int = 1
		AND (v->'impact'->'counts'->>'past_events_owned_by_moving_items')::int = 1
		AND (v->'impact'->'counts'->>'past_event_links')::int = 0
	FROM (SELECT pg_temp.fold_preview('a5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
		'c5000000-0000-4000-8000-000000000002') AS v) x),
	'an attachment on an ended event, or an ended event owned by a moving goal, blocks');
ROLLBACK TO SAVEPOINT event_attachment;

-- ---------------------------------------------------------------------------
-- 5. Apply: ended events, their comment and their Google mapping stay; task
--    entities follow their task without a paid re-read.

INSERT INTO results VALUES ('events_before', (SELECT jsonb_agg(jsonb_build_array(id, project_id, deleted_at, sync_status, last_synced_at, props, updated_at) ORDER BY id)
	FROM public.onto_events WHERE id IN ('15000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000003')));
INSERT INTO results VALUES ('fold', pg_temp.fold_apply('a5000000-0000-4000-8000-000000000001', 'c5000000-0000-4000-8000-000000000001',
	'c5000000-0000-4000-8000-000000000002', (SELECT value->>'confirmation_token' FROM results WHERE key = 'p1'), 'f5000000-0000-4000-8000-0000000000f1'));
SELECT pg_temp.assert_true((SELECT value->>'status' = 'folded' AND (value->>'calendar_jobs')::int = 1 AND (value->>'task_events_rebuilt')::int = 1
	FROM results WHERE key = 'fold'), 'fold applies: ' || (SELECT value::text FROM results WHERE key = 'fold'));

SELECT pg_temp.assert_true(
	(SELECT jsonb_agg(jsonb_build_array(id, project_id, deleted_at, sync_status, last_synced_at, props, updated_at) ORDER BY id)
		FROM public.onto_events WHERE id IN ('15000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000003'))
		= (SELECT value FROM results WHERE key = 'events_before')
	AND (SELECT deleted_at IS NOT NULL FROM public.onto_events WHERE id = '15000000-0000-4000-8000-000000000010')
	AND (SELECT project_id = 'c5000000-0000-4000-8000-000000000001' FROM public.onto_comments WHERE id = '35000000-0000-4000-8000-000000000001')
	AND NOT EXISTS (SELECT 1 FROM public.queue_jobs WHERE job_type = 'sync_calendar' AND (metadata::text LIKE '%15000000-0000-4000-8000-000000000001%'
		OR metadata::text LIKE '%15000000-0000-4000-8000-000000000002%' OR metadata::text LIKE '%15000000-0000-4000-8000-000000000003%'))
	AND (SELECT count(*) = 1 FROM public.queue_jobs WHERE job_type = 'sync_calendar' AND metadata->>'taskId' = 'e5000000-0000-4000-8000-000000000002'),
	'ended events are untouched in the source (sync mapping included) with their comment; only the task event is rebuilt; no calendar job names an ended event');
SELECT pg_temp.assert_true(
	(SELECT project_id = 'c5000000-0000-4000-8000-000000000002' FROM public.onto_edges WHERE id = '25000000-0000-4000-8000-000000000003')
	AND NOT EXISTS (SELECT 1 FROM public.onto_edges WHERE id IN ('25000000-0000-4000-8000-000000000004', '25000000-0000-4000-8000-000000000005'))
	AND (SELECT jsonb_array_length(manifest->'dropped_edges') = 2 FROM public.onto_project_fold_manifests WHERE id = 'f5000000-0000-4000-8000-0000000000f1'),
	'the task-goal link moves; links touching the rebuilt task event are dropped into the manifest');
SELECT pg_temp.assert_true(
	(SELECT bool_and(project_id = 'c5000000-0000-4000-8000-000000000002') AND count(*) = 2 FROM public.onto_task_entities
		WHERE task_id = 'e5000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c5000000-0000-4000-8000-000000000002' FROM public.onto_task_entity_state WHERE task_id = 'e5000000-0000-4000-8000-000000000001')
	AND (SELECT status = 'confirmed' FROM public.onto_task_entities WHERE id = '45000000-0000-4000-8000-000000000002')
	AND pg_temp.extract_jobs('e5000000-0000-4000-8000-000000000001') = (SELECT value::bigint FROM results WHERE key = 'extract_jobs_before')
	AND pg_temp.extract_jobs('e5000000-0000-4000-8000-000000000002') = (SELECT value::bigint FROM results WHERE key = 'extract_jobs_before_2'),
	'task entities and extraction state follow their task; no extraction job is queued');
SELECT pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM private.project_fold_policy_gaps()), 'no policy gaps after the fold');

-- ---------------------------------------------------------------------------
-- 6. Unfold: the task and its entities come back; ended events never moved.

INSERT INTO results VALUES ('u1', pg_temp.unfold_preview('a5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-0000000000f1'));
SELECT pg_temp.assert_true((SELECT value->'impact'->'blockers' = '[]'::jsonb AND value->'impact'->'staying' = '[]'::jsonb
	FROM results WHERE key = 'u1'), 'unfold plan: ' || (SELECT (value->'impact')::text FROM results WHERE key = 'u1'));
INSERT INTO results VALUES ('unfold', pg_temp.unfold_apply('a5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-0000000000f1',
	(SELECT value->>'confirmation_token' FROM results WHERE key = 'u1')));
SELECT pg_temp.assert_true(
	(SELECT value->>'status' = 'unfolded' FROM results WHERE key = 'unfold')
	AND (SELECT project_id = 'c5000000-0000-4000-8000-000000000001' FROM public.onto_tasks WHERE id = 'e5000000-0000-4000-8000-000000000001')
	AND (SELECT bool_and(project_id = 'c5000000-0000-4000-8000-000000000001') AND count(*) = 2 FROM public.onto_task_entities
		WHERE task_id = 'e5000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c5000000-0000-4000-8000-000000000001' FROM public.onto_task_entity_state WHERE task_id = 'e5000000-0000-4000-8000-000000000001')
	AND (SELECT project_id = 'c5000000-0000-4000-8000-000000000001' FROM public.onto_edges WHERE id = '25000000-0000-4000-8000-000000000003')
	AND (SELECT bool_and(project_id = 'c5000000-0000-4000-8000-000000000001' AND deleted_at IS NULL) FROM public.onto_events
		WHERE id IN ('15000000-0000-4000-8000-000000000001', '15000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000003'))
	AND pg_temp.extract_jobs('e5000000-0000-4000-8000-000000000001') = (SELECT value::bigint FROM results WHERE key = 'extract_jobs_before'),
	'unfold brings the task, its entities and its link back; ended events stayed put; still no extraction job: '
		|| (SELECT value::text FROM results WHERE key = 'unfold'));

ROLLBACK;
