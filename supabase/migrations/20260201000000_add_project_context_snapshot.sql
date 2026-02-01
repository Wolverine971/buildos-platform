-- supabase/migrations/20260201000000_add_project_context_snapshot.sql
-- Adds project_context_snapshot + metrics tables and queue type for snapshot jobs

-- Add queue type for snapshot builds
ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'build_project_context_snapshot';

-- Snapshot table
CREATE TABLE IF NOT EXISTS project_context_snapshot (
  project_id uuid PRIMARY KEY REFERENCES onto_projects(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  snapshot_version int NOT NULL DEFAULT 1,
  source_updated_at timestamptz,
  computed_at timestamptz NOT NULL DEFAULT now(),
  compute_ms int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keep updated_at current
DROP TRIGGER IF EXISTS trg_project_context_snapshot_updated_at ON project_context_snapshot;
CREATE TRIGGER trg_project_context_snapshot_updated_at
  BEFORE UPDATE ON project_context_snapshot
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Metrics table for snapshot build timings
CREATE TABLE IF NOT EXISTS project_context_snapshot_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  snapshot_version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'success',
  duration_ms int,
  computed_at timestamptz NOT NULL DEFAULT now(),
  queue_job_id text,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_project_context_snapshot_metrics_project
  ON project_context_snapshot_metrics(project_id);
CREATE INDEX IF NOT EXISTS idx_project_context_snapshot_metrics_time
  ON project_context_snapshot_metrics(computed_at DESC);

-- RLS
ALTER TABLE project_context_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_context_snapshot_metrics ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users with project access
DROP POLICY IF EXISTS project_context_snapshot_read ON project_context_snapshot;
CREATE POLICY project_context_snapshot_read
  ON project_context_snapshot FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS project_context_snapshot_metrics_read ON project_context_snapshot_metrics;
CREATE POLICY project_context_snapshot_metrics_read
  ON project_context_snapshot_metrics FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

