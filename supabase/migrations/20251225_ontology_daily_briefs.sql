-- Migration: Ontology Daily Brief Tables
-- Description: Creates new ontology-native tables for daily brief generation
-- Spec Reference: /docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md
-- Date: 2025-12-25

-- ============================================================================
-- 1. ONTOLOGY DAILY BRIEFS TABLE
-- Main daily brief records using ontology actor references
-- ============================================================================

CREATE TABLE IF NOT EXISTS ontology_daily_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES onto_actors(id) ON DELETE CASCADE,
  brief_date DATE NOT NULL,

  -- Content sections
  executive_summary TEXT NOT NULL DEFAULT '',
  llm_analysis TEXT,
  priority_actions TEXT[] DEFAULT '{}',

  -- Metadata (includes counts, graph stats, generation info)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Generation tracking
  generation_status TEXT NOT NULL DEFAULT 'pending',
  generation_error TEXT,
  generation_started_at TIMESTAMPTZ,
  generation_completed_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT ontology_daily_briefs_user_date_unique UNIQUE (user_id, brief_date),
  CONSTRAINT ontology_daily_briefs_status_check CHECK (
    generation_status IN ('pending', 'processing', 'completed', 'failed')
  )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ontology_daily_briefs_user_id
  ON ontology_daily_briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_ontology_daily_briefs_actor_id
  ON ontology_daily_briefs(actor_id);
CREATE INDEX IF NOT EXISTS idx_ontology_daily_briefs_brief_date
  ON ontology_daily_briefs(brief_date DESC);
CREATE INDEX IF NOT EXISTS idx_ontology_daily_briefs_user_date
  ON ontology_daily_briefs(user_id, brief_date DESC);
CREATE INDEX IF NOT EXISTS idx_ontology_daily_briefs_status
  ON ontology_daily_briefs(generation_status) WHERE generation_status != 'completed';

-- ============================================================================
-- 2. ONTOLOGY PROJECT BRIEFS TABLE
-- Per-project brief details linked to ontology projects
-- ============================================================================

CREATE TABLE IF NOT EXISTS ontology_project_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_brief_id UUID NOT NULL REFERENCES ontology_daily_briefs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,

  -- Content
  brief_content TEXT NOT NULL,

  -- Metadata (task counts, goal progress, plan status, etc.)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT ontology_project_briefs_daily_project_unique
    UNIQUE (daily_brief_id, project_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ontology_project_briefs_daily_brief_id
  ON ontology_project_briefs(daily_brief_id);
CREATE INDEX IF NOT EXISTS idx_ontology_project_briefs_project_id
  ON ontology_project_briefs(project_id);

-- ============================================================================
-- 3. ONTOLOGY BRIEF ENTITIES TABLE
-- Tracks which ontology entities were included in each brief (for analytics/audit)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ontology_brief_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_brief_id UUID NOT NULL REFERENCES ontology_daily_briefs(id) ON DELETE CASCADE,
  project_id UUID REFERENCES onto_projects(id) ON DELETE CASCADE,

  -- Entity reference
  entity_kind TEXT NOT NULL,
  entity_id UUID NOT NULL,

  -- Role in the brief (e.g., 'highlighted', 'blocked', 'next_step', 'recently_updated')
  role TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT ontology_brief_entities_kind_check CHECK (
    entity_kind IN ('task', 'goal', 'plan', 'milestone', 'output', 'document', 'risk', 'requirement', 'decision')
  )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ontology_brief_entities_daily_brief_id
  ON ontology_brief_entities(daily_brief_id);
CREATE INDEX IF NOT EXISTS idx_ontology_brief_entities_project_id
  ON ontology_brief_entities(project_id);
CREATE INDEX IF NOT EXISTS idx_ontology_brief_entities_entity
  ON ontology_brief_entities(entity_kind, entity_id);
CREATE INDEX IF NOT EXISTS idx_ontology_brief_entities_role
  ON ontology_brief_entities(role) WHERE role IS NOT NULL;

-- ============================================================================
-- 4. HELPER FUNCTIONS FOR ONTOLOGY QUERIES
-- Canonical relationship queries via onto_edges
-- ============================================================================

-- Function to get tasks for a plan via edges (plan -[has_task]-> task)
CREATE OR REPLACE FUNCTION get_plan_tasks(plan_uuid UUID)
RETURNS SETOF onto_tasks AS $$
  SELECT t.*
  FROM onto_tasks t
  JOIN onto_edges e ON e.dst_id = t.id
  WHERE e.rel = 'has_task'
    AND e.src_id = plan_uuid
    AND e.src_kind = 'plan'
    AND e.dst_kind = 'task';
$$ LANGUAGE SQL STABLE;

-- Function to get task dependencies (task -[depends_on]-> task)
CREATE OR REPLACE FUNCTION get_task_dependencies(task_uuid UUID)
RETURNS TABLE(
  depends_on_id UUID,
  depends_on_title TEXT,
  depends_on_state TEXT
) AS $$
  SELECT
    t.id,
    t.title,
    t.state_key
  FROM onto_edges e
  JOIN onto_tasks t ON t.id = e.dst_id
  WHERE e.src_id = task_uuid
    AND e.rel = 'depends_on'
    AND e.src_kind = 'task'
    AND e.dst_kind = 'task';
$$ LANGUAGE SQL STABLE;

-- Function to get goal progress (tasks that support a goal)
CREATE OR REPLACE FUNCTION get_goal_progress(goal_uuid UUID)
RETURNS TABLE(
  total_tasks INT,
  completed_tasks INT,
  progress_percent INT
) AS $$
  WITH contributing AS (
    SELECT t.id, t.state_key
    FROM onto_edges e
    JOIN onto_tasks t ON t.id = e.src_id
    WHERE e.dst_id = goal_uuid
      AND e.rel = 'supports_goal'
      AND e.src_kind = 'task'
      AND e.dst_kind = 'goal'
  )
  SELECT
    COUNT(*)::INT as total_tasks,
    COUNT(*) FILTER (WHERE state_key = 'done')::INT as completed_tasks,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE state_key = 'done')::NUMERIC / COUNT(*)) * 100)::INT
    END as progress_percent
  FROM contributing;
$$ LANGUAGE SQL STABLE;

-- Function to get tasks that block other tasks (unblocking tasks)
CREATE OR REPLACE FUNCTION get_unblocking_tasks(project_uuid UUID)
RETURNS TABLE(
  task_id UUID,
  task_title TEXT,
  task_state TEXT,
  blocks_count INT
) AS $$
  SELECT
    t.id as task_id,
    t.title as task_title,
    t.state_key as task_state,
    COUNT(e.src_id)::INT as blocks_count
  FROM onto_tasks t
  JOIN onto_edges e ON e.dst_id = t.id
  WHERE t.project_id = project_uuid
    AND e.rel = 'depends_on'
    AND e.src_kind = 'task'
    AND e.dst_kind = 'task'
    AND t.state_key != 'done'
  GROUP BY t.id, t.title, t.state_key
  ORDER BY blocks_count DESC;
$$ LANGUAGE SQL STABLE;

-- Function to get context document for a project
CREATE OR REPLACE FUNCTION get_project_context_document(project_uuid UUID)
RETURNS SETOF onto_documents AS $$
  SELECT d.*
  FROM onto_documents d
  JOIN onto_edges e ON e.dst_id = d.id
  WHERE e.src_id = project_uuid
    AND e.rel = 'has_context_document'
    AND e.src_kind = 'project'
    AND e.dst_kind = 'document';
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- 5. RLS POLICIES
-- Row-level security for ontology brief tables
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE ontology_daily_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontology_project_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ontology_brief_entities ENABLE ROW LEVEL SECURITY;

-- Users can only see their own daily briefs
CREATE POLICY "Users can view own ontology daily briefs"
  ON ontology_daily_briefs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ontology daily briefs"
  ON ontology_daily_briefs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ontology daily briefs"
  ON ontology_daily_briefs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own ontology daily briefs"
  ON ontology_daily_briefs FOR DELETE
  USING (auth.uid() = user_id);

-- Project briefs access via daily brief ownership
CREATE POLICY "Users can view own ontology project briefs"
  ON ontology_project_briefs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ontology_daily_briefs db
      WHERE db.id = daily_brief_id AND db.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own ontology project briefs"
  ON ontology_project_briefs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ontology_daily_briefs db
      WHERE db.id = daily_brief_id AND db.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own ontology project briefs"
  ON ontology_project_briefs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM ontology_daily_briefs db
      WHERE db.id = daily_brief_id AND db.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own ontology project briefs"
  ON ontology_project_briefs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ontology_daily_briefs db
      WHERE db.id = daily_brief_id AND db.user_id = auth.uid()
    )
  );

-- Brief entities access via daily brief ownership
CREATE POLICY "Users can view own ontology brief entities"
  ON ontology_brief_entities FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM ontology_daily_briefs db
      WHERE db.id = daily_brief_id AND db.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own ontology brief entities"
  ON ontology_brief_entities FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM ontology_daily_briefs db
      WHERE db.id = daily_brief_id AND db.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own ontology brief entities"
  ON ontology_brief_entities FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM ontology_daily_briefs db
      WHERE db.id = daily_brief_id AND db.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 6. SERVICE ROLE BYPASS POLICIES
-- Allow service role to bypass RLS for worker operations
-- ============================================================================

CREATE POLICY "Service role can manage ontology daily briefs"
  ON ontology_daily_briefs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage ontology project briefs"
  ON ontology_project_briefs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role can manage ontology brief entities"
  ON ontology_brief_entities FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- 7. UPDATED_AT TRIGGERS
-- Automatically update updated_at timestamp
-- ============================================================================

-- Trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER update_ontology_daily_briefs_updated_at
  BEFORE UPDATE ON ontology_daily_briefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ontology_project_briefs_updated_at
  BEFORE UPDATE ON ontology_project_briefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE ontology_daily_briefs IS
  'Ontology-native daily brief records. Links to onto_actors for ownership. Replaces legacy daily_briefs for ontology-based generation.';

COMMENT ON TABLE ontology_project_briefs IS
  'Per-project brief details for ontology projects. Links to onto_projects. Contains project-specific markdown and metadata.';

COMMENT ON TABLE ontology_brief_entities IS
  'Tracks which ontology entities (tasks, goals, plans, etc.) were included in each brief. Used for analytics and audit trails.';

COMMENT ON FUNCTION get_plan_tasks(UUID) IS
  'Returns all tasks belonging to a plan via has_task edges.';

COMMENT ON FUNCTION get_task_dependencies(UUID) IS
  'Returns all tasks that the given task depends on via depends_on edges.';

COMMENT ON FUNCTION get_goal_progress(UUID) IS
  'Calculates goal progress based on tasks that support it via supports_goal edges.';

COMMENT ON FUNCTION get_unblocking_tasks(UUID) IS
  'Returns tasks that block other tasks (when completed, will unblock dependencies).';

COMMENT ON FUNCTION get_project_context_document(UUID) IS
  'Returns the context document linked to a project via has_context_document edge.';
