-- supabase/migrations/20260116_ontology_brief_query_indexes.sql
-- Partial project_id indexes to speed brief-generation lookups on active entities.

CREATE INDEX IF NOT EXISTS idx_onto_tasks_project_active
  ON onto_tasks(project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_goals_project_active
  ON onto_goals(project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_plans_project_active
  ON onto_plans(project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_milestones_project_active
  ON onto_milestones(project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_risks_project_active
  ON onto_risks(project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_outputs_project_active
  ON onto_outputs(project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_requirements_project_active
  ON onto_requirements(project_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_onto_decisions_project_active
  ON onto_decisions(project_id)
  WHERE deleted_at IS NULL;
