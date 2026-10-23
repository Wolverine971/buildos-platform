-- supabase/migrations/20261023230100_workspace_suggestions.sql
--
-- Workspace suggestions (docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md). The agent looks
-- at a person's loose items and suggests, never acts:
--   file      these loose items belong in an existing project (target_project_id)
--   graduate  these loose items look like a new project (proposed_name)
--   fold      this small project reads like loose notes (target_project_id = the project)
-- The person accepts or dismisses each one. A dismissal is remembered by item_key, so the
-- same suggestion isn't made again.
--
-- 1. public.workspace_suggestions: the person reads their own rows; only the server writes.
-- 2. workspace_suggest queue type, and a best-effort trigger that queues one debounced run
--    per person a few minutes after a loose doc or task lands in their workspace.
-- 3. project_loop_activity skips the workspace (no paid project loops on loose items).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_onto_documents_workspace_suggest ON public.onto_documents;
--   DROP TRIGGER IF EXISTS trg_onto_tasks_workspace_suggest ON public.onto_tasks;
--   DROP FUNCTION IF EXISTS private.enqueue_workspace_suggest();
--   DROP TABLE IF EXISTS public.workspace_suggestions;
--   (restore project_loop_activity from 20260928000000; the queue_type value stays.)
--
-- Rehearse:
--   pnpm db:rehearse supabase/migrations/20261023230000_workspace_foundation.sql \
--     supabase/migrations/20261023230100_workspace_suggestions.sql \
--     --check supabase/tests/20261023230100_workspace_suggestions.check.sql --role-probe

DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'workspace_suggest';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Suggestions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workspace_suggestions (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
	workspace_project_id uuid NOT NULL REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	kind text NOT NULL CHECK (kind IN ('file', 'graduate', 'fold')),
	target_project_id uuid REFERENCES public.onto_projects(id) ON DELETE CASCADE,
	proposed_name text CHECK (proposed_name IS NULL OR char_length(proposed_name) BETWEEN 1 AND 120),
	reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 400),
	confidence real CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
	-- [{ "kind": "document" | "task", "id": uuid }]; empty for fold.
	items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(items) = 'array'),
	-- Sorted "kind:id" list (or the project id for fold): what a dismissal remembers.
	item_key text NOT NULL CHECK (char_length(item_key) BETWEEN 1 AND 20000),
	status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'stale')),
	model text,
	run_id uuid,
	-- What accepting did: { project_id, batch_id, moved } for undo and history.
	result jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	decided_at timestamptz,
	CONSTRAINT workspace_suggestions_target_shape CHECK (
		(kind = 'graduate' AND target_project_id IS NULL AND proposed_name IS NOT NULL)
		OR (kind IN ('file', 'fold') AND target_project_id IS NOT NULL)
	)
);

COMMENT ON TABLE public.workspace_suggestions IS
	'Agent suggestions for a person''s Workspace (file loose items into a project, start a project from them, fold a small project in). Suggestions only: nothing moves until the person accepts.';

CREATE INDEX IF NOT EXISTS workspace_suggestions_user_status_idx
	ON public.workspace_suggestions (user_id, status, created_at DESC);

-- One open suggestion per (person, kind, items, target).
CREATE UNIQUE INDEX IF NOT EXISTS workspace_suggestions_one_open_idx
	ON public.workspace_suggestions (
		user_id, kind, item_key, COALESCE(target_project_id, '00000000-0000-0000-0000-000000000000'::uuid)
	)
	WHERE status = 'open';

ALTER TABLE public.workspace_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_suggestions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workspace_suggestions TO authenticated;
GRANT ALL ON public.workspace_suggestions TO service_role;

DROP POLICY IF EXISTS workspace_suggestions_select_own ON public.workspace_suggestions;
CREATE POLICY workspace_suggestions_select_own ON public.workspace_suggestions
	FOR SELECT TO authenticated
	USING (user_id = auth.uid());

-- Project fold classifies every column that points at a project.
DO $fold$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NOT NULL THEN
		INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
		VALUES
			('public', 'workspace_suggestions', 'workspace_project_id', 'leave_behind',
				'Suggestions are history of the Workspace they were made for; a Workspace never folds.'),
			('public', 'workspace_suggestions', 'target_project_id', 'leave_behind',
				'A suggestion is history; once a project folds, its open suggestions go stale.')
		ON CONFLICT DO NOTHING;
	END IF;
END $fold$;

-- ---------------------------------------------------------------------------
-- 2. Queue a debounced suggestion run when a loose item lands
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.enqueue_workspace_suggest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
	v_user_id uuid;
BEGIN
	IF NEW.deleted_at IS NOT NULL THEN
		RETURN NULL;
	END IF;

	SELECT a.user_id INTO v_user_id
	FROM public.onto_projects AS p
	JOIN public.onto_actors AS a ON a.id = p.created_by
	WHERE p.id = NEW.project_id AND p.kind = 'workspace';
	IF v_user_id IS NULL THEN
		RETURN NULL;
	END IF;

	-- One pending run per person: captures in a burst share it (the dedup key holds while
	-- the job is pending), and the run reads whatever is loose when it starts.
	PERFORM public.add_queue_job(
		v_user_id,
		'workspace_suggest',
		jsonb_build_object('userId', v_user_id, 'workspaceProjectId', NEW.project_id),
		20,
		now() + interval '3 minutes',
		'workspace_suggest:' || v_user_id
	);
	RETURN NULL;
EXCEPTION WHEN OTHERS THEN
	-- Suggestions are optional; the capture must always win.
	RAISE WARNING 'enqueue_workspace_suggest failed for %: %', NEW.project_id, SQLERRM;
	RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_workspace_suggest() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_onto_documents_workspace_suggest ON public.onto_documents;
CREATE TRIGGER trg_onto_documents_workspace_suggest
	AFTER INSERT ON public.onto_documents
	FOR EACH ROW EXECUTE FUNCTION private.enqueue_workspace_suggest();

DROP TRIGGER IF EXISTS trg_onto_tasks_workspace_suggest ON public.onto_tasks;
CREATE TRIGGER trg_onto_tasks_workspace_suggest
	AFTER INSERT ON public.onto_tasks
	FOR EACH ROW EXECUTE FUNCTION private.enqueue_workspace_suggest();

-- ---------------------------------------------------------------------------
-- 3. Project loops skip the workspace
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.project_loop_activity(p_since timestamp with time zone, p_project_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(project_id uuid, created_by uuid, last_activity_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
	SELECT activity.project_id, activity.created_by, activity.last_activity_at
	FROM (
		SELECT
			p.id AS project_id,
			p.created_by,
			GREATEST(
				(
					SELECT max(l.created_at)
					FROM public.onto_project_logs l
					WHERE l.project_id = p.id
						AND l.created_at >= p_since
						AND COALESCE(l.after_data ->> 'event', '')
							NOT IN ('steward_charter_approved', 'steward_toggled')
				),
				(
					SELECT max(msg.created_at)
					FROM public.chat_messages msg
					WHERE msg.role = 'user'
						AND msg.created_at >= p_since
						AND msg.session_id IN (
							SELECT s.id
							FROM public.chat_sessions s
							WHERE s.context_type = 'project' AND s.entity_id = p.id
							UNION
							SELECT link.chat_session_id
							FROM public.chat_sessions_projects link
							WHERE link.project_id = p.id
						)
				)
			) AS last_activity_at
		FROM public.onto_projects p
		WHERE p.state_key IN ('active', 'planning')
			AND p.kind = 'project'
			AND p.deleted_at IS NULL
			AND p.archived_at IS NULL
			AND (p_project_ids IS NULL OR p.id = ANY (p_project_ids))
	) AS activity
	WHERE activity.last_activity_at >= p_since;
$function$;

NOTIFY pgrst, 'reload schema';
COMMIT;
