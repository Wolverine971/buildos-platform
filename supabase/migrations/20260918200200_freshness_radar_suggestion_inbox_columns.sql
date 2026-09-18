-- supabase/migrations/20260918200200_freshness_radar_suggestion_inbox_columns.sql
-- Jev freshness radar (Tasker 88), part 3 of 4: the freshness_update suggestion
-- kind and the AI Inbox freshness columns.
--
-- - A freshness_update suggestion belongs to a freshness scan, not a project loop
--   run, so run_id becomes nullable and exactly one parent is required. Fake loop
--   runs would pollute the auto-review cooldown and the activity timeline.
-- - At most one pending freshness_update bundle per project (DB-enforced
--   "one inbox item per project").
-- - inbox_items gains freshness columns. upsertInboxItem writes only the columns
--   it names, so an inbox resync never clears them.
--
-- Rollback (only while no freshness_update rows exist):
--   DROP INDEX project_suggestions_one_pending_freshness;
--   ALTER TABLE project_suggestions DROP CONSTRAINT project_suggestions_freshness_parent_check,
--     DROP CONSTRAINT project_suggestions_parent_check, DROP COLUMN freshness_scan_id,
--     ALTER COLUMN run_id SET NOT NULL;
--   restore project_suggestions_kind_check from 20260703010000;
--   ALTER TABLE inbox_items DROP COLUMN freshness_state, DROP COLUMN freshness_note,
--     DROP COLUMN freshness_flag_id, DROP COLUMN freshness_checked_at;

ALTER TABLE public.project_suggestions
	DROP CONSTRAINT IF EXISTS project_suggestions_kind_check;
ALTER TABLE public.project_suggestions
	ADD CONSTRAINT project_suggestions_kind_check
	CHECK (kind IN (
		'doc_org', 'doc_outdated', 'drift', 'task_conflict', 'audit_recommendation',
		'freshness_update'
	));

ALTER TABLE public.project_suggestions
	ADD COLUMN IF NOT EXISTS freshness_scan_id uuid
		REFERENCES public.freshness_scans(id) ON DELETE CASCADE;

ALTER TABLE public.project_suggestions
	ALTER COLUMN run_id DROP NOT NULL;

ALTER TABLE public.project_suggestions
	DROP CONSTRAINT IF EXISTS project_suggestions_parent_check;
ALTER TABLE public.project_suggestions
	ADD CONSTRAINT project_suggestions_parent_check
	CHECK (num_nonnulls(run_id, freshness_scan_id) = 1);

ALTER TABLE public.project_suggestions
	DROP CONSTRAINT IF EXISTS project_suggestions_freshness_parent_check;
ALTER TABLE public.project_suggestions
	ADD CONSTRAINT project_suggestions_freshness_parent_check
	CHECK ((kind = 'freshness_update') = (freshness_scan_id IS NOT NULL));

-- DB-enforced "one inbox item per project" for the radar bundle.
CREATE UNIQUE INDEX IF NOT EXISTS project_suggestions_one_pending_freshness
	ON public.project_suggestions(project_id)
	WHERE kind = 'freshness_update' AND status = 'pending';

CREATE INDEX IF NOT EXISTS project_suggestions_freshness_scan
	ON public.project_suggestions(freshness_scan_id)
	WHERE freshness_scan_id IS NOT NULL;

ALTER TABLE public.inbox_items
	ADD COLUMN IF NOT EXISTS freshness_state text NOT NULL DEFAULT 'fresh'
		CHECK (freshness_state IN ('fresh', 'possibly_stale')),
	ADD COLUMN IF NOT EXISTS freshness_note text,
	ADD COLUMN IF NOT EXISTS freshness_flag_id uuid
		REFERENCES public.freshness_flags(id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS freshness_checked_at timestamptz;

COMMENT ON COLUMN public.project_suggestions.freshness_scan_id IS
	'Parent freshness scan for kind freshness_update (Tasker 88). Exactly one of run_id and freshness_scan_id is set.';
COMMENT ON COLUMN public.inbox_items.freshness_state IS
	'Jev freshness radar marker: possibly_stale ranks below fresh in the project attention budget (Tasker 88).';
