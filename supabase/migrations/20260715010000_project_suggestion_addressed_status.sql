-- supabase/migrations/20260715010000_project_suggestion_addressed_status.sql
-- Findings and audit recommendations can be resolved by recording user context
-- without pretending that a mutation was applied or that the finding was rejected.

ALTER TABLE public.project_suggestions
  DROP CONSTRAINT IF EXISTS project_suggestions_status_check;

ALTER TABLE public.project_suggestions
  ADD CONSTRAINT project_suggestions_status_check
  CHECK (
    status IN (
      'pending',
      'approved',
      'delegated',
      'applied',
      'addressed',
      'rejected',
      'superseded',
      'failed'
    )
  );

COMMENT ON COLUMN public.project_suggestions.status IS
  'Lifecycle for executable proposals and non-mutating findings. addressed means user context resolved the finding without applying operations.';
