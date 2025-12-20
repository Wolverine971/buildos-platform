-- Migration: onto_tasks schema enhancement
-- Adds start_at, completed_at, deleted_at, description columns
-- Part of Ontology Schema Migration Phase 1
-- See: /docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md

-- =============================================================================
-- STEP 1: Add new columns to onto_tasks
-- =============================================================================

ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS start_at timestamptz;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_tasks ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN onto_tasks.start_at IS 'When work on this task should begin';
COMMENT ON COLUMN onto_tasks.completed_at IS 'When the task was marked as done';
COMMENT ON COLUMN onto_tasks.deleted_at IS 'Soft delete timestamp - null means active';
COMMENT ON COLUMN onto_tasks.description IS 'Task description (migrated from props.description)';

-- =============================================================================
-- STEP 2: Create indexes for efficient querying
-- =============================================================================

-- Index for date range queries (start to due)
CREATE INDEX IF NOT EXISTS idx_onto_tasks_start_at ON onto_tasks(start_at);

-- Index for completed tasks queries
CREATE INDEX IF NOT EXISTS idx_onto_tasks_completed_at ON onto_tasks(completed_at);

-- Partial index for active (non-deleted) tasks - most common query pattern
CREATE INDEX IF NOT EXISTS idx_onto_tasks_active ON onto_tasks(project_id, state_key)
  WHERE deleted_at IS NULL;

-- Index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_onto_tasks_deleted_at ON onto_tasks(deleted_at)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- STEP 3: Migrate data from props.description to description column
-- =============================================================================

-- Migrate description from props JSON to dedicated column
UPDATE onto_tasks
SET description = props->>'description'
WHERE props->>'description' IS NOT NULL
  AND props->>'description' != ''
  AND description IS NULL;

-- =============================================================================
-- STEP 4: Set completed_at for tasks that are already done
-- =============================================================================

-- For tasks with state_key = 'done', set completed_at to updated_at if not already set
UPDATE onto_tasks
SET completed_at = updated_at
WHERE state_key = 'done'
  AND completed_at IS NULL;

-- =============================================================================
-- STEP 5: Update search vector to include description column
-- =============================================================================

-- Note: search_vector is a GENERATED column, so we need to alter its expression
-- First check if it's a generated column, and if so, update the generation expression

-- Drop and recreate the generated column with the new expression that includes description
-- This will automatically rebuild all search vectors
DO $$
BEGIN
  -- Check if search_vector exists and is a generated column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_tasks'
    AND column_name = 'search_vector'
  ) THEN
    -- Drop the existing column
    ALTER TABLE onto_tasks DROP COLUMN IF EXISTS search_vector;
  END IF;

  -- Recreate as generated column with description included
  ALTER TABLE onto_tasks ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(props::text, '')), 'C')
    ) STORED;

  -- Recreate the GIN index for full-text search
  CREATE INDEX IF NOT EXISTS idx_onto_tasks_search ON onto_tasks USING GIN(search_vector);
END $$;
