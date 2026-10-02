-- supabase/migrations/20261001190000_project_icon_emoji.sql
-- Project emoji experiment (docs/specs/PROJECT_EMOJI_PLAN_2026-10-01.md): the Projects
-- tile shows two emojis Jev picked for the project instead of its initials.
--
-- onto_projects.icon_emoji holds the pick and where it came from:
--   { "glyphs": ["💰", "🚪"],        -- what the tile shows, in order
--     "source": "jev",               -- or "user" once people can choose their own
--     "variant": "rank" | "pair",
--     "model": "...", "generated_at": "...",
--     "input_hash": "...",           -- hash of the words it was picked from, for re-picks
--     "ranked": [["💰", 0.61], ...] } -- Jev's top candidates, for a later "pick another"
-- NULL means no pick yet; the tile falls back to initials.
--
-- Like the generated SVG icon, it is machine-maintained: writing it alone must not bump
-- updated_at, or a backfill would reorder everyone's Recent sort. The touch trigger's
-- machine-column list gains 'icon_emoji'; nothing else in it changes.
--
-- Rollback:
--   ALTER TABLE public.onto_projects DROP COLUMN icon_emoji;
--   and re-run 20260925180000_onto_projects_updated_at_ignores_machine_fields.sql.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.onto_projects ADD COLUMN IF NOT EXISTS icon_emoji jsonb;

COMMENT ON COLUMN public.onto_projects.icon_emoji IS
	'Tile emojis: {glyphs[], source, variant, model, generated_at, input_hash, ranked}. Machine-maintained; NULL shows initials.';

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
		'icon_emoji',
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

COMMENT ON FUNCTION public.onto_projects_touch_updated_at() IS
	'Stamps onto_projects.updated_at unless an UPDATE changed only machine-maintained columns (AI next step, generated icon or emoji, generated columns). Tasker 108.';

COMMIT;
