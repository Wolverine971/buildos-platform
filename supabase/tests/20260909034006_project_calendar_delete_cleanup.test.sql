-- supabase/tests/20260909034006_project_calendar_delete_cleanup.test.sql
-- PSQL-ONLY / DISPOSABLE DATABASE ONLY.
-- Apply fixtures/project_calendar_delete_base.sql, then the matching migration.
\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END; $$;
INSERT INTO onto_actors VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
INSERT INTO onto_projects (id,created_by) VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
INSERT INTO project_calendars VALUES
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','calendar-one','90000000-0000-4000-8000-000000000001',true),
('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','calendar-two','90000000-0000-4000-8000-000000000002',false);
INSERT INTO onto_events (id, project_id, created_by, props, sync_status) VALUES
('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{}','synced'),
('50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"external_event_id":"props-only","external_calendar_id":"calendar-one"}','synced'),
('50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{}',null);
INSERT INTO onto_event_sync (id,event_id,project_calendar_id,user_id,provider,external_event_id,sync_status) VALUES
('60000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','google','google-one','synced'),
('60000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','google','google-two','synced');
INSERT INTO task_calendar_events VALUES ('70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','google-one','calendar-one',NULL,'synced');
-- Previously deleted events still need provider cleanup when their project is deleted.
UPDATE onto_events SET deleted_at=now() WHERE id='50000000-0000-4000-8000-000000000001';
SAVEPOINT before_delete;
SELECT soft_delete_onto_project('30000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM queue_jobs), 'must enqueue every existing copy, including disabled sync, and deduplicate legacy tracking');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM onto_event_sync WHERE sync_status='pending'), 'mapped events must remain pending until provider deletion');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM queue_jobs WHERE metadata->'deletionSnapshot'->>'calendarSourceId'='90000000-0000-4000-8000-000000000002'), 'must retain collaborator source identity');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM onto_events WHERE deleted_at IS NULL), 'all local events must be deleted');
ROLLBACK TO before_delete;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM queue_jobs), 'queue admission must roll back with project deletion');
SELECT delete_onto_project('30000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM onto_projects), 'hard-delete RPC must remove project');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM onto_event_sync), 'hard-delete RPC must remove mappings');
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM queue_jobs), 'durable identities must survive hard-delete RPC cascades');
ROLLBACK TO before_delete;
-- A direct DELETE must also preserve identity before cascading.
DELETE FROM onto_projects WHERE id='30000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM queue_jobs), 'direct hard delete must queue provider cleanup');
ROLLBACK TO before_delete;
SELECT soft_delete_onto_project('30000000-0000-4000-8000-000000000001');
INSERT INTO onto_event_sync (id,event_id,project_calendar_id,user_id,provider,external_event_id,sync_status) VALUES
('60000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','google','late-google-event','synced');
SELECT pg_temp.assert_true((SELECT count(*)=4 FROM queue_jobs), 'late provider creations must get deletion work');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.queue_deleted_project_calendar_cleanup()','EXECUTE'), 'cleanup trigger must not expose privileged queue admission');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.queue_late_deleted_project_event_cleanup()','EXECUTE'), 'late cleanup trigger must not be public');
-- Hard-deleting a previously soft-deleted project must also recover missing jobs.
DELETE FROM queue_jobs;
SELECT delete_onto_project('30000000-0000-4000-8000-000000000001');
SELECT pg_temp.assert_true((SELECT count(*)=4 FROM queue_jobs), 'hard-delete must snapshot already-soft-deleted projects before removing mappings');
ROLLBACK TO before_delete;
CREATE OR REPLACE FUNCTION public.add_queue_job(p_user_id uuid, p_job_type text, p_metadata jsonb, p_priority integer DEFAULT 10, p_scheduled_for timestamptz DEFAULT now(), p_dedup_key text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'queue_unavailable'; END; $$;
DO $$ BEGIN
  BEGIN
    PERFORM soft_delete_onto_project('30000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'unexpected_success';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'queue_unavailable' THEN RAISE; END IF;
  END;
END; $$;
SELECT pg_temp.assert_true((SELECT deleted_at IS NULL FROM onto_projects), 'queue failure must prevent deletion from succeeding silently');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM queue_jobs), 'queue failure must not leave partial cleanup work');
ROLLBACK;
