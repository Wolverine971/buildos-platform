-- supabase/migrations/20261017160000_consolidation_check_mode.sql
-- Consolidation quick duplicate check (tasker 122).
--
-- A run with mode = 'check' reads the projects, finds groups (identical copies
-- for free, then one model call), stores them as a keep-only plan and finishes
-- as `checked`. It never asks a question, never applies and never holds the
-- root project's one open-run slot, so chat can run one before a nest or a
-- combine while a full consolidation is open on the same project.
--
-- Tables stay service-only: no RLS or grant changes.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.consolidation_runs
	ADD COLUMN mode text NOT NULL DEFAULT 'full';
ALTER TABLE public.consolidation_runs
	ADD CONSTRAINT consolidation_runs_mode_check CHECK (mode IN ('full', 'check'));
COMMENT ON COLUMN public.consolidation_runs.mode IS
	'full: survey, question cards, apply and undo. check: survey groups only, read-only, ends as checked.';

ALTER TABLE public.consolidation_runs DROP CONSTRAINT consolidation_runs_status_check;
ALTER TABLE public.consolidation_runs
	ADD CONSTRAINT consolidation_runs_status_check CHECK (
		status IN (
			'surveying', 'waiting', 'review', 'applying', 'applied', 'undone', 'failed',
			'cancelled', 'checked'
		)
	);
-- `checked` belongs to check runs, and a check run never waits, applies or undoes.
ALTER TABLE public.consolidation_runs
	ADD CONSTRAINT consolidation_runs_check_mode_status CHECK (
		CASE mode
			WHEN 'check' THEN status IN ('surveying', 'checked', 'failed', 'cancelled')
			ELSE status <> 'checked'
		END
	);

-- One unfinished full run per project; check runs never take the slot.
DROP INDEX public.consolidation_runs_one_open_idx;
CREATE UNIQUE INDEX consolidation_runs_one_open_idx ON public.consolidation_runs (root_project_id)
	WHERE mode = 'full' AND status IN ('surveying', 'waiting', 'review', 'applying');

COMMIT;
