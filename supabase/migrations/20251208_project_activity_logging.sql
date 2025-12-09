-- supabase/migrations/20251208_project_activity_logging.sql
-- Migration: Project Activity Logging & Next Steps
-- Date: 2025-12-08
-- Description: Adds onto_project_logs table for tracking project changes
--              and next_step columns to onto_projects for AI-generated recommendations

-- ============================================================================
-- 1. CREATE onto_project_logs TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS onto_project_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  changed_by UUID NOT NULL REFERENCES auth.users(id),
  change_source TEXT,
  chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT check_action_values CHECK (action IN ('created', 'updated', 'deleted')),
  CONSTRAINT check_change_source_values CHECK (change_source IS NULL OR change_source IN ('chat', 'form', 'brain_dump', 'api')),
  CONSTRAINT check_entity_type_values CHECK (entity_type IN (
    'project', 'task', 'output', 'note', 'goal', 'milestone', 'risk', 'plan', 'requirement', 'source', 'edge'
  ))
);

-- Add comment
COMMENT ON TABLE onto_project_logs IS 'Tracks all changes to project-related entities for activity feed and audit trail';
COMMENT ON COLUMN onto_project_logs.entity_type IS 'Type of entity that was changed (task, output, project, etc.)';
COMMENT ON COLUMN onto_project_logs.action IS 'What happened: created, updated, or deleted';
COMMENT ON COLUMN onto_project_logs.before_data IS 'State before change (null for creates)';
COMMENT ON COLUMN onto_project_logs.after_data IS 'State after change (null for deletes)';
COMMENT ON COLUMN onto_project_logs.change_source IS 'How the change was made: chat, form, brain_dump, or api';

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

CREATE INDEX idx_project_logs_project_id ON onto_project_logs(project_id);
CREATE INDEX idx_project_logs_entity ON onto_project_logs(entity_type, entity_id);
CREATE INDEX idx_project_logs_created_at ON onto_project_logs(created_at DESC);
CREATE INDEX idx_project_logs_changed_by ON onto_project_logs(changed_by);
CREATE INDEX idx_project_logs_chat_session ON onto_project_logs(chat_session_id) WHERE chat_session_id IS NOT NULL;

-- ============================================================================
-- 3. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE onto_project_logs ENABLE ROW LEVEL SECURITY;

-- Users can view logs for projects they own
CREATE POLICY "Users can view logs for their projects"
  ON onto_project_logs FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM onto_projects WHERE created_by = auth.uid()
    )
  );

-- Users can insert logs for projects they own
CREATE POLICY "Users can insert logs for their projects"
  ON onto_project_logs FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM onto_projects WHERE created_by = auth.uid()
    )
    AND changed_by = auth.uid()
  );

-- Service role can do anything (for worker service)
CREATE POLICY "Service role full access"
  ON onto_project_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 4. ADD NEXT STEP COLUMNS TO onto_projects
-- ============================================================================

ALTER TABLE onto_projects
  ADD COLUMN IF NOT EXISTS next_step_short TEXT,
  ADD COLUMN IF NOT EXISTS next_step_long TEXT,
  ADD COLUMN IF NOT EXISTS next_step_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_step_source TEXT;

-- Add constraints
ALTER TABLE onto_projects
  ADD CONSTRAINT check_next_step_long_length CHECK (next_step_long IS NULL OR char_length(next_step_long) <= 650);

ALTER TABLE onto_projects
  ADD CONSTRAINT check_next_step_source_values CHECK (next_step_source IS NULL OR next_step_source IN ('ai', 'user'));

-- Add comments
COMMENT ON COLUMN onto_projects.next_step_short IS 'One sentence AI-generated next action (< 100 chars)';
COMMENT ON COLUMN onto_projects.next_step_long IS 'Detailed next step with entity refs using [[type:id|text]] format (max 650 chars)';
COMMENT ON COLUMN onto_projects.next_step_updated_at IS 'When the next step was last updated';
COMMENT ON COLUMN onto_projects.next_step_source IS 'Who set the next step: ai or user';

-- ============================================================================
-- 5. HELPER FUNCTION: Log project change
-- ============================================================================

CREATE OR REPLACE FUNCTION log_project_change(
  p_project_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_action TEXT,
  p_before_data JSONB DEFAULT NULL,
  p_after_data JSONB DEFAULT NULL,
  p_changed_by UUID DEFAULT NULL,
  p_change_source TEXT DEFAULT NULL,
  p_chat_session_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
  v_changed_by UUID;
BEGIN
  -- Use provided changed_by or fall back to auth.uid()
  v_changed_by := COALESCE(p_changed_by, auth.uid());

  INSERT INTO onto_project_logs (
    project_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    changed_by,
    change_source,
    chat_session_id
  ) VALUES (
    p_project_id,
    p_entity_type,
    p_entity_id,
    p_action,
    p_before_data,
    p_after_data,
    v_changed_by,
    p_change_source,
    p_chat_session_id
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_project_change IS 'Helper function to log a change to a project entity';

-- ============================================================================
-- 6. HELPER FUNCTION: Update project next step
-- ============================================================================

CREATE OR REPLACE FUNCTION update_project_next_step(
  p_project_id UUID,
  p_next_step_short TEXT,
  p_next_step_long TEXT,
  p_source TEXT DEFAULT 'ai'
) RETURNS VOID AS $$
BEGIN
  UPDATE onto_projects
  SET
    next_step_short = p_next_step_short,
    next_step_long = p_next_step_long,
    next_step_updated_at = now(),
    next_step_source = p_source,
    updated_at = now()
  WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_project_next_step IS 'Helper function to update a project''s next step recommendation';

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT ON onto_project_logs TO authenticated;
GRANT ALL ON onto_project_logs TO service_role;
GRANT EXECUTE ON FUNCTION log_project_change TO authenticated;
GRANT EXECUTE ON FUNCTION log_project_change TO service_role;
GRANT EXECUTE ON FUNCTION update_project_next_step TO authenticated;
GRANT EXECUTE ON FUNCTION update_project_next_step TO service_role;
