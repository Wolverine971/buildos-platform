-- supabase/migrations/20260613000000_project_loops.sql
-- Project Loops: per-project reconciliation pass that emits reviewable
-- AI suggestions (doc organization, outdated docs, drift, task de-confliction).
--
-- A loop RUN (project_loop_runs) is produced by the buildos_project_loop worker.
-- It emits SUGGESTIONS (project_suggestions) whose `operations` are declarative
-- deferred tool calls. Approving a suggestion replays those operations through
-- the web ChatToolExecutor (the same write path the agentic chat uses).

-- Queue type for loop jobs
ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'buildos_project_loop';

-- =====================================================
-- project_loop_runs
-- =====================================================
CREATE TABLE IF NOT EXISTS project_loop_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  trigger_reason text NOT NULL DEFAULT 'manual'
    CHECK (trigger_reason IN ('end_of_day', 'burst', 'manual')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'waiting_review', 'completed', 'failed')),
  summary text,
  suggestion_count int NOT NULL DEFAULT 0,
  error_message text,
  cost_usd numeric,
  chat_session_id uuid,
  queue_job_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_loop_runs_project
  ON project_loop_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_loop_runs_status
  ON project_loop_runs(status);

DROP TRIGGER IF EXISTS trg_project_loop_runs_updated_at ON project_loop_runs;
CREATE TRIGGER trg_project_loop_runs_updated_at
  BEFORE UPDATE ON project_loop_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- project_suggestions
-- =====================================================
CREATE TABLE IF NOT EXISTS project_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES project_loop_runs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('doc_org', 'doc_outdated', 'drift', 'task_conflict')),
  risk_tier int NOT NULL DEFAULT 1 CHECK (risk_tier BETWEEN 1 AND 3),
  title text NOT NULL,
  rationale text,
  confidence numeric,
  -- Ordered list of declarative tool calls: [{ tool, args, label? }]
  operations jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'applied', 'rejected', 'superseded', 'failed')),
  sort_order int NOT NULL DEFAULT 0,
  depends_on uuid REFERENCES project_suggestions(id) ON DELETE SET NULL,
  -- Execution outcome (applied operations / error detail)
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  applied_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_suggestions_project_status
  ON project_suggestions(project_id, status);
CREATE INDEX IF NOT EXISTS idx_project_suggestions_run
  ON project_suggestions(run_id);

DROP TRIGGER IF EXISTS trg_project_suggestions_updated_at ON project_suggestions;
CREATE TRIGGER trg_project_suggestions_updated_at
  BEFORE UPDATE ON project_suggestions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE project_loop_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_suggestions ENABLE ROW LEVEL SECURITY;

-- Reads: any actor with read access to the project.
DROP POLICY IF EXISTS project_loop_runs_read ON project_loop_runs;
CREATE POLICY project_loop_runs_read
  ON project_loop_runs FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

DROP POLICY IF EXISTS project_suggestions_read ON project_suggestions;
CREATE POLICY project_suggestions_read
  ON project_suggestions FOR SELECT
  USING (current_actor_has_project_access(project_id, 'read'));

-- Writes: members with write access may update suggestion status
-- (approve / reject). Inserts + run lifecycle are service-role only (worker).
DROP POLICY IF EXISTS project_suggestions_update ON project_suggestions;
CREATE POLICY project_suggestions_update
  ON project_suggestions FOR UPDATE
  USING (current_actor_has_project_access(project_id, 'write'))
  WITH CHECK (current_actor_has_project_access(project_id, 'write'));
