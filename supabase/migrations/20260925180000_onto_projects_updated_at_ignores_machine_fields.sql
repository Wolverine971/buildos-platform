-- supabase/migrations/20260925180000_onto_projects_updated_at_ignores_machine_fields.sql
-- Tasker 108 item 3: a project's updated_at means "someone changed the project",
-- not "a background job wrote a derived field".
--
-- onto_projects used the shared set_updated_at() trigger, which stamps now() on
-- every UPDATE. Every morning the daily brief writes an AI next step onto each
-- briefed project, so on 2026-09-25 all 9 of DJ's active projects carried an
-- updated_at within ~60 ms of next_step_updated_at (~14:58 UTC). Two effects:
--   * the end-of-day Project Loop scan (updated_at inside the user's local day)
--     treated every briefed project as touched, so 14 of 31 runs in 14 days
--     analyzed projects nobody had worked on;
--   * /projects, sorted by updated_at, reordered each morning by the brief's
--     processing order instead of the user's work.
--
-- This trigger keeps OLD.updated_at when an UPDATE changes only
-- machine-maintained columns: the AI next step, the generated icon, and
-- generated columns (search_vector, facet_*; in a BEFORE trigger NEW does not
-- hold their new values yet). Any other column change stamps now() as before.
-- The explicit updated_at a writer sends is ignored either way, as before.
--
-- Rollback:
--   DROP TRIGGER trg_onto_projects_updated ON public.onto_projects;
--   CREATE TRIGGER trg_onto_projects_updated BEFORE UPDATE ON public.onto_projects
--     FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--   DROP FUNCTION public.onto_projects_touch_updated_at();

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.onto_projects_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $$
DECLARE
	-- Derived or background-maintained; changing only these is not project activity.
	v_machine_columns text[] := ARRAY[
		'updated_at',
		'next_step_short',
		'next_step_long',
		'next_step_source',
		'next_step_updated_at',
		'icon_svg',
		'icon_concept',
		'icon_generated_at',
		'icon_generation_source',
		'icon_generation_prompt',
		'search_vector',
		'facet_context',
		'facet_scale',
		'facet_stage'
	];
BEGIN
	IF (to_jsonb(NEW) - v_machine_columns) = (to_jsonb(OLD) - v_machine_columns) THEN
		NEW.updated_at := OLD.updated_at;
	ELSE
		NEW.updated_at := now();
	END IF;
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.onto_projects_touch_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onto_projects_touch_updated_at() FROM anon;
-- Evaluated for signed-in users' project edits (repo rule for invoker triggers).
GRANT EXECUTE ON FUNCTION public.onto_projects_touch_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.onto_projects_touch_updated_at() TO service_role;

DROP TRIGGER IF EXISTS trg_onto_projects_updated ON public.onto_projects;
CREATE TRIGGER trg_onto_projects_updated
	BEFORE UPDATE ON public.onto_projects
	FOR EACH ROW EXECUTE FUNCTION public.onto_projects_touch_updated_at();

COMMENT ON FUNCTION public.onto_projects_touch_updated_at() IS
	'Stamps onto_projects.updated_at unless an UPDATE changed only machine-maintained columns (AI next step, generated icon, generated columns). Tasker 108.';

COMMIT;
