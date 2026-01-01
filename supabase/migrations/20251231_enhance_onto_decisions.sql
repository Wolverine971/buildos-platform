-- supabase/migrations/20251231_enhance_onto_decisions.sql
-- Migration: Enhance onto_decisions for Mobile Command Center
-- Adds state_key, outcome, description columns for full decision tracking

-- =============================================================================
-- PHASE 1: Add new columns to onto_decisions
-- =============================================================================

-- Add state_key column with default 'pending'
ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS state_key TEXT NOT NULL DEFAULT 'pending';

-- Add outcome column (what was decided)
ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS outcome TEXT;

-- Add description column
ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS description TEXT;

-- Make decision_at nullable (decisions can be pending before a date is set)
ALTER TABLE onto_decisions ALTER COLUMN decision_at DROP NOT NULL;

-- =============================================================================
-- PHASE 2: Add comments
-- =============================================================================

COMMENT ON COLUMN onto_decisions.state_key IS 'Decision state: pending, made, deferred, reversed';
COMMENT ON COLUMN onto_decisions.outcome IS 'What was decided - the actual decision made';
COMMENT ON COLUMN onto_decisions.description IS 'Context and background for the decision';
COMMENT ON COLUMN onto_decisions.decision_at IS 'When the decision was made (nullable for pending decisions)';

-- =============================================================================
-- PHASE 3: Create indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_onto_decisions_state_key ON onto_decisions(state_key);

-- =============================================================================
-- PHASE 4: Add search vector for decisions
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_decisions'
    AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE onto_decisions ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(outcome, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(rationale, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(props::text, '')), 'D')
      ) STORED;

    CREATE INDEX IF NOT EXISTS idx_onto_decisions_search ON onto_decisions USING GIN(search_vector);
  END IF;
END $$;

-- =============================================================================
-- PHASE 5: Migrate existing data
-- =============================================================================

-- Set state_key to 'made' for decisions that have a decision_at date
UPDATE onto_decisions
SET state_key = 'made'
WHERE decision_at IS NOT NULL
  AND state_key = 'pending';

-- =============================================================================
-- PHASE 6: Update get_project_skeleton to include decision_count (keep contract)
-- =============================================================================

-- Remove any accidental single-arg overload to avoid breaking callers
DROP FUNCTION IF EXISTS get_project_skeleton(uuid);

CREATE OR REPLACE FUNCTION get_project_skeleton(
  p_project_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
    'state_key', p.state_key,
    'type_key', p.type_key,
    'next_step_short', p.next_step_short,
    'next_step_long', p.next_step_long,
    'next_step_source', p.next_step_source,
    'next_step_updated_at', p.next_step_updated_at,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    -- Entity counts using scalar subqueries (filter soft-deleted entities)
    'task_count', (SELECT count(*) FROM onto_tasks WHERE project_id = p.id AND deleted_at IS NULL),
    'output_count', (SELECT count(*) FROM onto_outputs WHERE project_id = p.id AND deleted_at IS NULL),
    'document_count', (SELECT count(*) FROM onto_documents WHERE project_id = p.id AND deleted_at IS NULL),
    'goal_count', (SELECT count(*) FROM onto_goals WHERE project_id = p.id AND deleted_at IS NULL),
    'plan_count', (SELECT count(*) FROM onto_plans WHERE project_id = p.id AND deleted_at IS NULL),
    'milestone_count', (SELECT count(*) FROM onto_milestones WHERE project_id = p.id AND deleted_at IS NULL),
    'risk_count', (SELECT count(*) FROM onto_risks WHERE project_id = p.id AND deleted_at IS NULL),
    'decision_count', (SELECT count(*) FROM onto_decisions WHERE project_id = p.id AND deleted_at IS NULL)
  )
  FROM onto_projects p
  WHERE p.id = p_project_id
    AND p.created_by = p_actor_id
    AND p.deleted_at IS NULL;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_project_skeleton(uuid, uuid) TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'onto_decisions enhancement complete - added state_key, outcome, description columns';
END $$;
