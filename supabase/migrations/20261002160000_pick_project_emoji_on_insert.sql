-- supabase/migrations/20261002160000_pick_project_emoji_on_insert.sql
-- New projects get their tile emoji automatically (docs/specs/PROJECT_EMOJI_PLAN_2026-10-01.md).
--
-- An AFTER INSERT trigger on onto_projects queues one `pick_project_emoji` job per project,
-- whatever created it (the app, chat, an MCP client). The job runs a minute later so the
-- project's START HERE usually exists by then; the worker
-- (apps/worker/src/workers/project-emoji/projectEmojiWorker.ts) has GPT-6 Luna pick two emoji,
-- checks them against the catalog, and fills onto_projects.icon_emoji only while it is still
-- empty, so an owner's own choice always wins.
--
-- Like the embedding trigger, queueing is best effort: a failure raises a warning and the
-- project insert always succeeds. Until a worker that knows the job type is deployed, the
-- jobs wait in the queue (claims filter by job type).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_onto_projects_pick_emoji ON public.onto_projects;
--   DROP FUNCTION IF EXISTS public.enqueue_project_emoji_pick();
--   (The queue_type value stays; enum values cannot be dropped.)

DO $$ BEGIN
	ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'pick_project_emoji';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.enqueue_project_emoji_pick()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
	v_user_id uuid;
BEGIN
	IF NEW.icon_emoji IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
		RETURN NULL;
	END IF;

	SELECT a.user_id INTO v_user_id
	FROM public.onto_actors a
	WHERE a.id = NEW.created_by;
	IF v_user_id IS NULL THEN
		RETURN NULL;
	END IF;

	PERFORM public.add_queue_job(
		v_user_id,
		'pick_project_emoji',
		jsonb_build_object('projectId', NEW.id, 'userId', v_user_id),
		10,
		now() + interval '1 minute',
		'pick_project_emoji:' || NEW.id
	);
	RETURN NULL;
EXCEPTION WHEN OTHERS THEN
	-- The emoji is decoration; the project write must always win.
	RAISE WARNING 'enqueue_project_emoji_pick failed for project %: %', NEW.id, SQLERRM;
	RETURN NULL;
END;
$$;

-- Server-only: it runs as a trigger, never called directly.
REVOKE ALL ON FUNCTION public.enqueue_project_emoji_pick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_project_emoji_pick() TO service_role;

DROP TRIGGER IF EXISTS trg_onto_projects_pick_emoji ON public.onto_projects;
CREATE TRIGGER trg_onto_projects_pick_emoji
	AFTER INSERT ON public.onto_projects
	FOR EACH ROW EXECUTE FUNCTION public.enqueue_project_emoji_pick();

COMMENT ON FUNCTION public.enqueue_project_emoji_pick() IS
	'Queues pick_project_emoji for a new project (tile emoji; the worker fills onto_projects.icon_emoji only while empty).';

COMMIT;
