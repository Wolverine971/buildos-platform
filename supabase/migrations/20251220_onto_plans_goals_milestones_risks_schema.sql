-- Migration: onto_plans, onto_goals, onto_milestones, onto_risks schema updates
-- Phase 4: Add plan, description, deleted_at to onto_plans
-- Phase 5: Add goal, description, updated_at, completed_at, target_date, deleted_at to onto_goals
-- Phase 6: Add milestone, description, completed_at, updated_at, deleted_at to onto_milestones
-- Phase 7: Add deleted_at, mitigated_at, updated_at to onto_risks
-- Part of Ontology Schema Migration
-- See: /docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md

-- =============================================================================
-- PHASE 4: onto_plans - Add new columns
-- =============================================================================

-- Add new columns to onto_plans
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS plan text;
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_plans ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN onto_plans.plan IS 'Plan content/details (structured plan information)';
COMMENT ON COLUMN onto_plans.description IS 'Brief description of the plan (migrated from props.description)';
COMMENT ON COLUMN onto_plans.deleted_at IS 'Soft delete timestamp - null means active';

-- Create indexes for onto_plans
CREATE INDEX IF NOT EXISTS idx_onto_plans_deleted_at ON onto_plans(deleted_at)
  WHERE deleted_at IS NULL;

-- Migrate description from props to column
UPDATE onto_plans
SET description = props->>'description'
WHERE props->>'description' IS NOT NULL
  AND props->>'description' != ''
  AND description IS NULL;

-- =============================================================================
-- PHASE 5: onto_goals - Add new columns
-- =============================================================================

-- Add new columns to onto_goals
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS goal text;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS target_date timestamptz;
ALTER TABLE onto_goals ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN onto_goals.goal IS 'Goal content/details (structured goal information)';
COMMENT ON COLUMN onto_goals.description IS 'Brief description of the goal (migrated from props.description)';
COMMENT ON COLUMN onto_goals.updated_at IS 'Last update timestamp';
COMMENT ON COLUMN onto_goals.completed_at IS 'Timestamp when goal was achieved';
COMMENT ON COLUMN onto_goals.target_date IS 'Target date for goal completion (migrated from props.target_date)';
COMMENT ON COLUMN onto_goals.deleted_at IS 'Soft delete timestamp - null means active';

-- Create indexes for onto_goals
CREATE INDEX IF NOT EXISTS idx_onto_goals_deleted_at ON onto_goals(deleted_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_goals_target_date ON onto_goals(target_date);
CREATE INDEX IF NOT EXISTS idx_onto_goals_completed_at ON onto_goals(completed_at);

-- Migrate data from props to columns
UPDATE onto_goals
SET
  description = COALESCE(description, props->>'description'),
  target_date = CASE
    WHEN props->>'target_date' IS NOT NULL AND target_date IS NULL
    THEN (props->>'target_date')::timestamptz
    ELSE target_date
  END
WHERE props->>'description' IS NOT NULL
   OR props->>'target_date' IS NOT NULL;

-- Set completed_at for achieved goals
UPDATE onto_goals
SET completed_at = COALESCE(updated_at, created_at)
WHERE state_key = 'achieved'
  AND completed_at IS NULL;

-- =============================================================================
-- PHASE 6: onto_milestones - Add new columns
-- =============================================================================

-- Add new columns to onto_milestones
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS milestone text;
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE onto_milestones ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN onto_milestones.milestone IS 'Milestone content/details (structured milestone information)';
COMMENT ON COLUMN onto_milestones.description IS 'Brief description of the milestone (migrated from props.description)';
COMMENT ON COLUMN onto_milestones.completed_at IS 'Timestamp when milestone was completed';
COMMENT ON COLUMN onto_milestones.updated_at IS 'Last update timestamp';
COMMENT ON COLUMN onto_milestones.deleted_at IS 'Soft delete timestamp - null means active';

-- Create indexes for onto_milestones
CREATE INDEX IF NOT EXISTS idx_onto_milestones_deleted_at ON onto_milestones(deleted_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_milestones_completed_at ON onto_milestones(completed_at);

-- Migrate description from props to column
UPDATE onto_milestones
SET description = props->>'description'
WHERE props->>'description' IS NOT NULL
  AND props->>'description' != ''
  AND description IS NULL;

-- Set completed_at for completed milestones
UPDATE onto_milestones
SET completed_at = COALESCE(updated_at, created_at)
WHERE state_key = 'completed'
  AND completed_at IS NULL;

-- =============================================================================
-- PHASE 7: onto_risks - Add new columns
-- =============================================================================

-- Add new columns to onto_risks
ALTER TABLE onto_risks ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_risks ADD COLUMN IF NOT EXISTS mitigated_at timestamptz;
ALTER TABLE onto_risks ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN onto_risks.deleted_at IS 'Soft delete timestamp - null means active';
COMMENT ON COLUMN onto_risks.mitigated_at IS 'Timestamp when risk was mitigated';
COMMENT ON COLUMN onto_risks.updated_at IS 'Last update timestamp';

-- Create indexes for onto_risks
CREATE INDEX IF NOT EXISTS idx_onto_risks_deleted_at ON onto_risks(deleted_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_risks_mitigated_at ON onto_risks(mitigated_at);

-- Set mitigated_at for mitigated risks
UPDATE onto_risks
SET mitigated_at = COALESCE(updated_at, created_at)
WHERE state_key = 'mitigated'
  AND mitigated_at IS NULL;

-- Add content column to onto_risks (user requested)
ALTER TABLE onto_risks ADD COLUMN IF NOT EXISTS content text;

COMMENT ON COLUMN onto_risks.content IS 'Detailed risk content/description text';

-- =============================================================================
-- PHASE 8: onto_requirements - Add new columns
-- =============================================================================

-- Add new columns to onto_requirements
ALTER TABLE onto_requirements ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_requirements ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE onto_requirements ADD COLUMN IF NOT EXISTS priority integer;

COMMENT ON COLUMN onto_requirements.deleted_at IS 'Soft delete timestamp - null means active';
COMMENT ON COLUMN onto_requirements.updated_at IS 'Last update timestamp';
COMMENT ON COLUMN onto_requirements.priority IS 'Priority level (1=highest, higher numbers=lower priority)';

-- Create indexes for onto_requirements
CREATE INDEX IF NOT EXISTS idx_onto_requirements_deleted_at ON onto_requirements(deleted_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_onto_requirements_priority ON onto_requirements(priority);

-- =============================================================================
-- PHASE 9: onto_outputs - Add new columns
-- =============================================================================

-- Add new columns to onto_outputs
ALTER TABLE onto_outputs ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_outputs ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN onto_outputs.deleted_at IS 'Soft delete timestamp - null means active';
COMMENT ON COLUMN onto_outputs.description IS 'Brief description of the output';

-- Create indexes for onto_outputs
CREATE INDEX IF NOT EXISTS idx_onto_outputs_deleted_at ON onto_outputs(deleted_at)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- PHASE 10: onto_decisions - Add new columns
-- =============================================================================

-- Add new columns to onto_decisions
ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE onto_decisions ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

COMMENT ON COLUMN onto_decisions.deleted_at IS 'Soft delete timestamp - null means active';
COMMENT ON COLUMN onto_decisions.updated_at IS 'Last update timestamp';

-- Create indexes for onto_decisions
CREATE INDEX IF NOT EXISTS idx_onto_decisions_deleted_at ON onto_decisions(deleted_at)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- Update search vectors to include new description columns
-- =============================================================================

-- onto_plans search vector update
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_plans'
    AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE onto_plans DROP COLUMN IF EXISTS search_vector;
  END IF;

  ALTER TABLE onto_plans ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(plan, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(props::text, '')), 'D')
    ) STORED;

  CREATE INDEX IF NOT EXISTS idx_onto_plans_search ON onto_plans USING GIN(search_vector);
END $$;

-- onto_goals search vector update
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_goals'
    AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE onto_goals DROP COLUMN IF EXISTS search_vector;
  END IF;

  ALTER TABLE onto_goals ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(goal, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(props::text, '')), 'D')
    ) STORED;

  CREATE INDEX IF NOT EXISTS idx_onto_goals_search ON onto_goals USING GIN(search_vector);
END $$;

-- onto_milestones search vector update
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_milestones'
    AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE onto_milestones DROP COLUMN IF EXISTS search_vector;
  END IF;

  ALTER TABLE onto_milestones ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(milestone, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(props::text, '')), 'D')
    ) STORED;

  CREATE INDEX IF NOT EXISTS idx_onto_milestones_search ON onto_milestones USING GIN(search_vector);
END $$;

-- onto_outputs search vector update (add description)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_outputs'
    AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE onto_outputs DROP COLUMN IF EXISTS search_vector;
  END IF;

  ALTER TABLE onto_outputs ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(props::text, '')), 'D')
    ) STORED;

  CREATE INDEX IF NOT EXISTS idx_onto_outputs_search ON onto_outputs USING GIN(search_vector);
END $$;

-- onto_risks search vector update (add content)
DO $$
BEGIN
  -- onto_risks doesn't have search_vector yet, so just add it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_risks'
    AND column_name = 'search_vector'
  ) THEN
    ALTER TABLE onto_risks ADD COLUMN search_vector tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(props::text, '')), 'D')
      ) STORED;

    CREATE INDEX IF NOT EXISTS idx_onto_risks_search ON onto_risks USING GIN(search_vector);
  END IF;
END $$;
