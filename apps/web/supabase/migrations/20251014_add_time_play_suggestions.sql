-- apps/web/supabase/migrations/20251014_add_time_play_suggestions.sql
-- Purpose: Support build blocks and AI suggestions for Time Play

BEGIN;

-- Allow additional block types beyond the Phase 1 "project" default
ALTER TABLE time_blocks
	DROP CONSTRAINT IF EXISTS time_blocks_block_type_check;

ALTER TABLE time_blocks
	ADD CONSTRAINT time_blocks_block_type_check
		CHECK (block_type IN ('project', 'build'));

-- Make project_id optional so build blocks can exist without a project
ALTER TABLE time_blocks
	ALTER COLUMN project_id DROP NOT NULL;

-- Update the project requirement constraint to allow build blocks without projects
ALTER TABLE time_blocks
	DROP CONSTRAINT IF EXISTS valid_project;

ALTER TABLE time_blocks
	ADD CONSTRAINT valid_project
		CHECK (
			(block_type = 'project' AND project_id IS NOT NULL)
			OR (block_type = 'build' AND project_id IS NULL)
		);

-- Store AI suggestion metadata for Phase 2 features
ALTER TABLE time_blocks
	ADD COLUMN IF NOT EXISTS ai_suggestions JSONB,
	ADD COLUMN IF NOT EXISTS suggestions_summary TEXT,
	ADD COLUMN IF NOT EXISTS suggestions_generated_at TIMESTAMPTZ,
	ADD COLUMN IF NOT EXISTS suggestions_model TEXT;

-- Existing rows should conform to new NOT NULL logic
UPDATE time_blocks
SET block_type = 'project'
WHERE block_type IS NULL;

COMMIT;
