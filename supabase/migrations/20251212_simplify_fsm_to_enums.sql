-- supabase/migrations/20251212_simplify_fsm_to_enums.sql
-- ============================================
-- FSM Simplification: Convert state_key from varchar to enums
--
-- This migration:
-- 1. Creates PostgreSQL enums for each entity type's states
-- 2. Migrates existing state_key varchar columns to enums
-- 3. Drops the FSM-related functions (get_allowed_transitions, onto_guards_pass)
-- 4. Sets proper defaults
--
-- Why: The FSM machinery was designed for template-driven workflows.
-- With templates removed, every entity type uses the same static states,
-- making the FSM unnecessary overhead.
-- ============================================

-- ============================================
-- STEP 0: Drop dependent views
-- These views reference state_key columns and must be dropped
-- before we can alter the column types. We'll recreate them after.
-- ============================================

-- Save the view definition so we can recreate it
DROP VIEW IF EXISTS task_documents;

-- ============================================
-- STEP 0.5: Add missing state_key columns
-- Some tables (onto_goals, onto_milestones) never had state_key added
-- ============================================

-- Add state_key to onto_goals if it doesn't exist
ALTER TABLE onto_goals
  ADD COLUMN IF NOT EXISTS state_key text NOT NULL DEFAULT 'draft';

CREATE INDEX IF NOT EXISTS idx_onto_goals_state ON onto_goals(state_key);

-- Add state_key to onto_milestones if it doesn't exist
ALTER TABLE onto_milestones
  ADD COLUMN IF NOT EXISTS state_key text NOT NULL DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_onto_milestones_state ON onto_milestones(state_key);

-- ============================================
-- STEP 1: Create state enums
-- ============================================

-- Task states: todo → in_progress → done, or blocked
DO $$ BEGIN
  CREATE TYPE task_state AS ENUM ('todo', 'in_progress', 'blocked', 'done');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Project states: planning → active → completed, or cancelled
DO $$ BEGIN
  CREATE TYPE project_state AS ENUM ('planning', 'active', 'completed', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Plan states: draft → active → completed
DO $$ BEGIN
  CREATE TYPE plan_state AS ENUM ('draft', 'active', 'completed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Output states: draft → in_progress → review → published
DO $$ BEGIN
  CREATE TYPE output_state AS ENUM ('draft', 'in_progress', 'review', 'published');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Document states: draft → review → published
DO $$ BEGIN
  CREATE TYPE document_state AS ENUM ('draft', 'review', 'published');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Goal states: draft → active → achieved, or abandoned
DO $$ BEGIN
  CREATE TYPE goal_state AS ENUM ('draft', 'active', 'achieved', 'abandoned');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Milestone states: pending → in_progress → completed, or missed
DO $$ BEGIN
  CREATE TYPE milestone_state AS ENUM ('pending', 'in_progress', 'completed', 'missed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Risk states: identified → mitigated/occurred → closed
DO $$ BEGIN
  CREATE TYPE risk_state AS ENUM ('identified', 'mitigated', 'occurred', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- STEP 2: Migrate existing data to enums
-- Using a safe approach that maps all known values
-- ============================================

-- Tasks: Map old states to new enum
ALTER TABLE onto_tasks
  ALTER COLUMN state_key DROP DEFAULT;

ALTER TABLE onto_tasks
  ALTER COLUMN state_key TYPE task_state
  USING (
    CASE COALESCE(state_key, 'todo')
      WHEN 'todo' THEN 'todo'::task_state
      WHEN 'in_progress' THEN 'in_progress'::task_state
      WHEN 'blocked' THEN 'blocked'::task_state
      WHEN 'done' THEN 'done'::task_state
      WHEN 'completed' THEN 'done'::task_state  -- Alias: completed → done
      WHEN 'archived' THEN 'done'::task_state   -- Map archived to done
      ELSE 'todo'::task_state  -- Default fallback
    END
  );

ALTER TABLE onto_tasks
  ALTER COLUMN state_key SET DEFAULT 'todo'::task_state;

-- Projects
ALTER TABLE onto_projects
  ALTER COLUMN state_key DROP DEFAULT;

ALTER TABLE onto_projects
  ALTER COLUMN state_key TYPE project_state
  USING (
    CASE COALESCE(state_key, 'planning')
      WHEN 'planning' THEN 'planning'::project_state
      WHEN 'active' THEN 'active'::project_state
      WHEN 'completed' THEN 'completed'::project_state
      WHEN 'cancelled' THEN 'cancelled'::project_state
      WHEN 'draft' THEN 'planning'::project_state  -- Map draft to planning
      ELSE 'planning'::project_state
    END
  );

ALTER TABLE onto_projects
  ALTER COLUMN state_key SET DEFAULT 'planning'::project_state;

-- Plans
ALTER TABLE onto_plans
  ALTER COLUMN state_key DROP DEFAULT;

ALTER TABLE onto_plans
  ALTER COLUMN state_key TYPE plan_state
  USING (
    CASE COALESCE(state_key, 'draft')
      WHEN 'draft' THEN 'draft'::plan_state
      WHEN 'active' THEN 'active'::plan_state
      WHEN 'completed' THEN 'completed'::plan_state
      ELSE 'draft'::plan_state
    END
  );

ALTER TABLE onto_plans
  ALTER COLUMN state_key SET DEFAULT 'draft'::plan_state;

-- Outputs
ALTER TABLE onto_outputs
  ALTER COLUMN state_key DROP DEFAULT;

ALTER TABLE onto_outputs
  ALTER COLUMN state_key TYPE output_state
  USING (
    CASE COALESCE(state_key, 'draft')
      WHEN 'draft' THEN 'draft'::output_state
      WHEN 'in_progress' THEN 'in_progress'::output_state
      WHEN 'review' THEN 'review'::output_state
      WHEN 'published' THEN 'published'::output_state
      WHEN 'approved' THEN 'published'::output_state  -- Map approved to published
      ELSE 'draft'::output_state
    END
  );

ALTER TABLE onto_outputs
  ALTER COLUMN state_key SET DEFAULT 'draft'::output_state;

-- Documents
ALTER TABLE onto_documents
  ALTER COLUMN state_key DROP DEFAULT;

ALTER TABLE onto_documents
  ALTER COLUMN state_key TYPE document_state
  USING (
    CASE COALESCE(state_key, 'draft')
      WHEN 'draft' THEN 'draft'::document_state
      WHEN 'review' THEN 'review'::document_state
      WHEN 'published' THEN 'published'::document_state
      ELSE 'draft'::document_state
    END
  );

ALTER TABLE onto_documents
  ALTER COLUMN state_key SET DEFAULT 'draft'::document_state;

-- Goals
ALTER TABLE onto_goals
  ALTER COLUMN state_key DROP DEFAULT;

ALTER TABLE onto_goals
  ALTER COLUMN state_key TYPE goal_state
  USING (
    CASE COALESCE(state_key, 'draft')
      WHEN 'draft' THEN 'draft'::goal_state
      WHEN 'active' THEN 'active'::goal_state
      WHEN 'achieved' THEN 'achieved'::goal_state
      WHEN 'abandoned' THEN 'abandoned'::goal_state
      WHEN 'completed' THEN 'achieved'::goal_state  -- Map completed to achieved
      ELSE 'draft'::goal_state
    END
  );

ALTER TABLE onto_goals
  ALTER COLUMN state_key SET DEFAULT 'draft'::goal_state;

-- Milestones
ALTER TABLE onto_milestones
  ALTER COLUMN state_key DROP DEFAULT;

ALTER TABLE onto_milestones
  ALTER COLUMN state_key TYPE milestone_state
  USING (
    CASE COALESCE(state_key, 'pending')
      WHEN 'pending' THEN 'pending'::milestone_state
      WHEN 'in_progress' THEN 'in_progress'::milestone_state
      WHEN 'completed' THEN 'completed'::milestone_state
      WHEN 'missed' THEN 'missed'::milestone_state
      WHEN 'done' THEN 'completed'::milestone_state  -- Map done to completed
      ELSE 'pending'::milestone_state
    END
  );

ALTER TABLE onto_milestones
  ALTER COLUMN state_key SET DEFAULT 'pending'::milestone_state;

-- Risks
ALTER TABLE onto_risks
  ALTER COLUMN state_key DROP DEFAULT;

ALTER TABLE onto_risks
  ALTER COLUMN state_key TYPE risk_state
  USING (
    CASE COALESCE(state_key, 'identified')
      WHEN 'identified' THEN 'identified'::risk_state
      WHEN 'mitigated' THEN 'mitigated'::risk_state
      WHEN 'occurred' THEN 'occurred'::risk_state
      WHEN 'closed' THEN 'closed'::risk_state
      ELSE 'identified'::risk_state
    END
  );

ALTER TABLE onto_risks
  ALTER COLUMN state_key SET DEFAULT 'identified'::risk_state;

-- ============================================
-- STEP 3: Recreate dependent views
-- ============================================

-- Recreate task_documents view with the new enum types
CREATE OR REPLACE VIEW task_documents AS
SELECT
  t.id as task_id,
  t.title as task_title,
  t.project_id,
  d.id as document_id,
  d.title as document_title,
  d.type_key as document_type,
  d.props->>'doc_type' as doc_type,
  d.props->>'content' as content,
  d.state_key::text as document_state,  -- Cast enum to text for compatibility
  e.props as edge_props,
  e.created_at as linked_at
FROM onto_tasks t
JOIN onto_edges e ON (
  e.dst_kind = 'task'
  AND e.dst_id = t.id
  AND e.src_kind = 'document'
  AND e.rel = 'relates_to'
)
JOIN onto_documents d ON d.id = e.src_id
ORDER BY t.id, d.created_at DESC;

-- ============================================
-- STEP 4: Drop FSM functions (no longer needed)
-- ============================================

DROP FUNCTION IF EXISTS get_allowed_transitions(text, uuid);
DROP FUNCTION IF EXISTS onto_guards_pass(jsonb, jsonb);

-- ============================================
-- STEP 5: Add comments for documentation
-- ============================================

COMMENT ON TYPE task_state IS 'Valid states for tasks: todo → in_progress → done, or blocked';
COMMENT ON TYPE project_state IS 'Valid states for projects: planning → active → completed, or cancelled';
COMMENT ON TYPE plan_state IS 'Valid states for plans: draft → active → completed';
COMMENT ON TYPE output_state IS 'Valid states for outputs: draft → in_progress → review → published';
COMMENT ON TYPE document_state IS 'Valid states for documents: draft → review → published';
COMMENT ON TYPE goal_state IS 'Valid states for goals: draft → active → achieved, or abandoned';
COMMENT ON TYPE milestone_state IS 'Valid states for milestones: pending → in_progress → completed, or missed';
COMMENT ON TYPE risk_state IS 'Valid states for risks: identified → mitigated/occurred → closed';

COMMENT ON COLUMN onto_tasks.state_key IS 'Task state (enum): todo, in_progress, blocked, done';
COMMENT ON COLUMN onto_projects.state_key IS 'Project state (enum): planning, active, completed, cancelled';
COMMENT ON COLUMN onto_plans.state_key IS 'Plan state (enum): draft, active, completed';
COMMENT ON COLUMN onto_outputs.state_key IS 'Output state (enum): draft, in_progress, review, published';
COMMENT ON COLUMN onto_documents.state_key IS 'Document state (enum): draft, review, published';
COMMENT ON COLUMN onto_goals.state_key IS 'Goal state (enum): draft, active, achieved, abandoned';
COMMENT ON COLUMN onto_milestones.state_key IS 'Milestone state (enum): pending, in_progress, completed, missed';
COMMENT ON COLUMN onto_risks.state_key IS 'Risk state (enum): identified, mitigated, occurred, closed';

-- ============================================
-- Verification queries (for manual testing)
-- ============================================

-- Uncomment to verify migration:
-- SELECT 'tasks' as entity, state_key, count(*) FROM onto_tasks GROUP BY state_key;
-- SELECT 'projects' as entity, state_key, count(*) FROM onto_projects GROUP BY state_key;
-- SELECT 'plans' as entity, state_key, count(*) FROM onto_plans GROUP BY state_key;
-- SELECT 'outputs' as entity, state_key, count(*) FROM onto_outputs GROUP BY state_key;
-- SELECT 'documents' as entity, state_key, count(*) FROM onto_documents GROUP BY state_key;
-- SELECT 'goals' as entity, state_key, count(*) FROM onto_goals GROUP BY state_key;
-- SELECT 'milestones' as entity, state_key, count(*) FROM onto_milestones GROUP BY state_key;
-- SELECT 'risks' as entity, state_key, count(*) FROM onto_risks GROUP BY state_key;
