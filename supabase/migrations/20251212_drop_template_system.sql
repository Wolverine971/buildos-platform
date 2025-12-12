-- supabase/migrations/20251212_drop_template_system.sql
-- Migration: Drop template system tables and columns
-- Description: Final cleanup - removes onto_templates table and all references
-- Author: Agent
-- Date: 2025-12-12
--
-- Prerequisites:
-- - 20251211_remove_template_dependencies_from_rpc.sql must be run first
-- - All application code must be updated to not depend on templates
--
-- This migration:
-- 1. Drops template_id and template_snapshot columns from onto_events
-- 2. Drops agent_template_creation_requests table
-- 3. Drops onto_templates table
-- 4. Drops onto_template_status enum

BEGIN;

-- ============================================================================
-- STEP 1: Remove template columns from onto_events
-- ============================================================================

-- Drop the foreign key constraint first
ALTER TABLE onto_events
  DROP CONSTRAINT IF EXISTS onto_events_template_id_fkey;

-- Drop the columns
ALTER TABLE onto_events
  DROP COLUMN IF EXISTS template_id,
  DROP COLUMN IF EXISTS template_snapshot;

-- ============================================================================
-- STEP 2: Drop agent_template_creation_requests table
-- This table was used for async template creation requests from the agent
-- ============================================================================

DROP TABLE IF EXISTS agent_template_creation_requests CASCADE;

-- ============================================================================
-- STEP 3: Drop onto_templates table
-- CASCADE will handle:
-- - parent_template_id self-reference
-- - Any remaining foreign key references
-- ============================================================================

-- First drop the trigger
DROP TRIGGER IF EXISTS trg_onto_templates_updated ON onto_templates;

-- Drop the table
DROP TABLE IF EXISTS onto_templates CASCADE;

-- ============================================================================
-- STEP 4: Drop the template status enum
-- ============================================================================

DROP TYPE IF EXISTS onto_template_status CASCADE;

-- ============================================================================
-- Verification (run manually after migration)
-- ============================================================================
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'onto_events' AND column_name IN ('template_id', 'template_snapshot');
-- Should return 0 rows

-- SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onto_templates');
-- Should return false

-- SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_template_creation_requests');
-- Should return false

-- SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onto_template_status');
-- Should return false

COMMIT;
