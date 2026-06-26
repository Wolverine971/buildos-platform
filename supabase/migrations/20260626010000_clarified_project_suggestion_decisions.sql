-- supabase/migrations/20260626010000_clarified_project_suggestion_decisions.sql
-- Clarified project-suggestion decisions: a suggestion can delegate execution to
-- a child Agent Run and stay in the inbox as "deciding" until the run finishes.

ALTER TABLE project_suggestions
  DROP CONSTRAINT IF EXISTS project_suggestions_status_check;

ALTER TABLE project_suggestions
  ADD CONSTRAINT project_suggestions_status_check
  CHECK (status IN ('pending', 'approved', 'delegated', 'applied', 'rejected', 'superseded', 'failed'));

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS source_suggestion_id uuid REFERENCES project_suggestions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_decision text CHECK (source_decision IN ('approve', 'dismiss'));

ALTER TABLE project_suggestions
  ADD COLUMN IF NOT EXISTS agent_run_id uuid REFERENCES agent_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agent_runs_source_suggestion
  ON agent_runs(source_suggestion_id)
  WHERE source_suggestion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_suggestions_agent_run
  ON project_suggestions(agent_run_id)
  WHERE agent_run_id IS NOT NULL;
