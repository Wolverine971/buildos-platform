-- supabase/migrations/20261017190000_project_merged_stays_archived.sql
-- Tasker 122: a combined (merged-away) project is always archived.
--
-- The fold sets archived_at and merged_into_project_id in one UPDATE, and unfold
-- clears merged_into_project_id in the same UPDATE that restores archived_at. Any
-- other un-archive (for example a connector explicitly scoped to the source calling
-- update_onto_project with archived:false) would leave a "merged but live" project:
-- hidden from the visible-project set yet treated as live by search and reads.
-- Deleting the destination clears merged_into_project_id (ON DELETE SET NULL), so the
-- source simply becomes an ordinary archived project.
--
-- onto_projects is small and prod holds no merged rows (checked 2026-10-17), so the
-- validating scan is instant.

BEGIN;

ALTER TABLE public.onto_projects
	ADD CONSTRAINT onto_projects_merged_is_archived
	CHECK (merged_into_project_id IS NULL OR archived_at IS NOT NULL);

COMMENT ON CONSTRAINT onto_projects_merged_is_archived ON public.onto_projects IS
	'A combined project stays archived; only unfold (which clears merged_into_project_id in the same UPDATE) brings it back.';

COMMIT;
