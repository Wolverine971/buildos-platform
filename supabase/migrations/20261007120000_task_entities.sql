-- supabase/migrations/20261007120000_task_entities.sql
-- Task entities: the people, places, times, phone numbers, emails and links a task mentions,
-- read out of its title and description so the app can show quick-access chips (Call, Map,
-- Join, Who, When) and agents can answer "what's Pat's number?" without rereading prose.
--
-- How it stays correct (research: docs/research/task-entity-layer-2026-10-07.md):
--   - An AFTER INSERT/UPDATE trigger on onto_tasks queues `extract_task_entities` whenever the
--     title or description changes (same md5 digest gate as the embedding trigger). Status,
--     date and priority edits never queue a read. The job starts 15 s after the write, and its
--     dedup slot includes the digest, so an edit made while a read is running gets its own job.
--   - The worker (apps/worker/src/workers/task-entities/extractTaskEntitiesWorker.ts) re-reads
--     the task, skips when onto_task_entity_state already holds that text's hash, asks the
--     fast JSON model lane for entities, and merges by (task, kind, natural_key):
--       confirmed rows are kept (the owner's choice), dismissed rows are tombstones that block
--       the same entity from coming back, and only machine-suggested rows are replaced or
--       removed when the text changes.
--   - Owners change `status` only (confirm, dismiss, undo); everything else is written by the
--     service-role worker.
--
-- The trigger itself is attached by 20261007120100_task_entities_trigger.sql, applied with the
-- worker deploy that registers `extract_task_entities`: jobs queued before then would wait
-- unclaimed and trip the worker's oldest-pending queue alert.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_onto_tasks_extract_entities ON public.onto_tasks;
--   DROP FUNCTION IF EXISTS public.enqueue_task_entity_extraction();
--   DROP TABLE IF EXISTS public.onto_task_entities, public.onto_task_entity_state;
--   (The queue_type value stays; enum values cannot be dropped.)

DO $$ BEGIN
	ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'extract_task_entities';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ============================================================================
-- 1. TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.onto_task_entities (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	task_id uuid NOT NULL REFERENCES public.onto_tasks(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN (
		'person', 'org', 'place', 'time', 'phone', 'email', 'link', 'meeting_link', 'reference'
	)),
	-- The entity's own normalized value (E.164 phone, lowercased email, canonical URL,
	-- collapsed name or address, ISO time). Re-reads match on it, never on text position.
	natural_key text NOT NULL CHECK (char_length(natural_key) BETWEEN 1 AND 500),
	value text NOT NULL CHECK (char_length(value) BETWEEN 1 AND 2000),
	display text NOT NULL CHECK (char_length(display) BETWEEN 1 AND 200),
	role text NOT NULL DEFAULT 'primary' CHECK (role IN (
		'primary', 'secondary', 'avoid', 'hours', 'log', 'follow_up', 'meeting', 'deadline',
		'owner_self'
	)),
	-- Who or what a phone, email, place or time belongs to ("Pat S.", "Chesapeake Tax").
	about text CHECK (about IS NULL OR char_length(about) <= 200),
	-- The exact words it was read from, so a chip can show its source.
	quote text CHECK (quote IS NULL OR char_length(quote) <= 1000),
	confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high', 'medium', 'low')),
	source text NOT NULL DEFAULT 'llm' CHECK (source IN ('llm', 'agent', 'user', 'calendar')),
	status text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'confirmed', 'dismissed')),
	-- False when a confirmed entity's words are no longer in the task text.
	in_text boolean NOT NULL DEFAULT true,
	position smallint NOT NULL DEFAULT 0,
	data jsonb NOT NULL DEFAULT '{}'::jsonb,
	source_hash text,
	extractor_version integer,
	status_changed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT onto_task_entities_task_kind_key_unique UNIQUE (task_id, kind, natural_key)
);

CREATE INDEX IF NOT EXISTS idx_onto_task_entities_project
	ON public.onto_task_entities (project_id);

COMMENT ON TABLE public.onto_task_entities IS
	'People, places, times, phones, emails and links read out of a task''s text (extract_task_entities). Owners change status only.';

CREATE TABLE IF NOT EXISTS public.onto_task_entity_state (
	task_id uuid PRIMARY KEY REFERENCES public.onto_tasks(id) ON DELETE CASCADE,
	project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	-- Hash of the title + description the current entities were read from.
	source_hash text NOT NULL,
	extractor_version integer NOT NULL,
	outcome text NOT NULL CHECK (outcome IN ('extracted', 'empty', 'failed')),
	entity_count integer NOT NULL DEFAULT 0,
	model text,
	error text,
	extracted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onto_task_entity_state_project
	ON public.onto_task_entity_state (project_id);

COMMENT ON TABLE public.onto_task_entity_state IS
	'Which version of a task''s text its entities were last read from; the worker skips unchanged text.';

-- ============================================================================
-- 2. ACCESS
-- ============================================================================

ALTER TABLE public.onto_task_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onto_task_entity_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onto_task_entities_member_read ON public.onto_task_entities;
CREATE POLICY onto_task_entities_member_read ON public.onto_task_entities
	FOR SELECT TO authenticated
	USING (public.current_actor_has_project_member_access(project_id, 'read'));

-- Members who can edit the task can confirm, dismiss or restore its entities. The column
-- grant below limits what such an update may touch.
DROP POLICY IF EXISTS onto_task_entities_member_status ON public.onto_task_entities;
CREATE POLICY onto_task_entities_member_status ON public.onto_task_entities
	FOR UPDATE TO authenticated
	USING (public.current_actor_has_project_member_access(project_id, 'write'))
	WITH CHECK (public.current_actor_has_project_member_access(project_id, 'write'));

DROP POLICY IF EXISTS onto_task_entity_state_member_read ON public.onto_task_entity_state;
CREATE POLICY onto_task_entity_state_member_read ON public.onto_task_entity_state
	FOR SELECT TO authenticated
	USING (public.current_actor_has_project_member_access(project_id, 'read'));

REVOKE ALL ON TABLE public.onto_task_entities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.onto_task_entity_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.onto_task_entities TO authenticated;
GRANT UPDATE (status, status_changed_at, updated_at) ON TABLE public.onto_task_entities TO authenticated;
GRANT SELECT ON TABLE public.onto_task_entity_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.onto_task_entities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.onto_task_entity_state TO service_role;

-- ============================================================================
-- 3. WRITE-PATH ENQUEUE FUNCTION (attached in 20261007120100_task_entities_trigger.sql)
-- ============================================================================

-- Fires for every writer (web routes, agent gateway, MCP, worker, calendar sync, SQL
-- moves), so no write path can skip the read. Best effort: a failure only raises a warning.
CREATE OR REPLACE FUNCTION public.enqueue_task_entity_extraction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
	v_digest text;
	v_user_id uuid;
BEGIN
	-- A task moved to another project takes its entities along, so access follows the task.
	IF TG_OP = 'UPDATE' AND NEW.project_id IS DISTINCT FROM OLD.project_id THEN
		UPDATE public.onto_task_entities SET project_id = NEW.project_id WHERE task_id = NEW.id;
		UPDATE public.onto_task_entity_state SET project_id = NEW.project_id WHERE task_id = NEW.id;
	END IF;

	IF NEW.deleted_at IS NOT NULL THEN
		RETURN NULL;
	END IF;

	v_digest := md5(coalesce(NEW.title, '') || chr(31) || coalesce(NEW.description, ''));

	IF TG_OP = 'UPDATE'
		AND v_digest = md5(coalesce(OLD.title, '') || chr(31) || coalesce(OLD.description, ''))
		AND OLD.deleted_at IS NULL THEN
		RETURN NULL;
	END IF;

	SELECT a.user_id INTO v_user_id
	FROM public.onto_actors a
	WHERE a.id = NEW.created_by;
	IF v_user_id IS NULL THEN
		SELECT a.user_id INTO v_user_id
		FROM public.onto_projects p
		JOIN public.onto_actors a ON a.id = p.created_by
		WHERE p.id = NEW.project_id;
	END IF;
	IF v_user_id IS NULL THEN
		RETURN NULL;
	END IF;

	PERFORM public.add_queue_job(
		v_user_id,
		'extract_task_entities',
		jsonb_build_object('taskId', NEW.id, 'projectId', NEW.project_id, 'userId', v_user_id),
		10,
		now() + interval '15 seconds',
		'extract_task_entities:' || NEW.id || ':' || v_digest
	);
	RETURN NULL;
EXCEPTION WHEN OTHERS THEN
	-- Entities are a convenience; the task write must always win.
	RAISE WARNING 'enqueue_task_entity_extraction failed for task %: %', NEW.id, SQLERRM;
	RETURN NULL;
END;
$function$;

-- Server-only: it runs as a trigger, never called directly.
REVOKE ALL ON FUNCTION public.enqueue_task_entity_extraction() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_task_entity_extraction() TO service_role;

COMMENT ON FUNCTION public.enqueue_task_entity_extraction() IS
	'Queues extract_task_entities when a task''s title or description changes (or it is restored); moves its entities with the task.';

COMMIT;
