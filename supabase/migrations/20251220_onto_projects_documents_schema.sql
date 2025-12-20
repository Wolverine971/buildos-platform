-- supabase/migrations/20251220_onto_projects_documents_schema.sql
-- Migration: onto_projects and onto_documents schema updates
-- Phase 2: Remove also_types from onto_projects
-- Phase 3: Add content, description, deleted_at to onto_documents
-- Part of Ontology Schema Migration
-- See: /docs/migrations/active/ONTOLOGY_SCHEMA_MIGRATION_PLAN.md

-- =============================================================================
-- PHASE 2: onto_projects - Remove also_types column
-- =============================================================================

-- Drop the GIN index on also_types first
DROP INDEX IF EXISTS idx_onto_projects_also_types;

-- Remove the also_types column (no data migration needed as feature was unused)
ALTER TABLE onto_projects DROP COLUMN IF EXISTS also_types;

COMMENT ON TABLE onto_projects IS 'Ontology projects - also_types column removed (Dec 2025)';

-- =============================================================================
-- PHASE 3: onto_documents - Add new columns
-- =============================================================================

-- Add new columns to onto_documents
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE onto_documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN onto_documents.content IS 'Document content (migrated from props.body_markdown)';
COMMENT ON COLUMN onto_documents.description IS 'Brief description of the document';
COMMENT ON COLUMN onto_documents.deleted_at IS 'Soft delete timestamp - null means active';

-- =============================================================================
-- STEP 2: Create indexes for onto_documents
-- =============================================================================

-- Partial index for active (non-deleted) documents - most common query pattern
CREATE INDEX IF NOT EXISTS idx_onto_documents_active ON onto_documents(project_id, state_key)
  WHERE deleted_at IS NULL;

-- Index for soft delete filtering
CREATE INDEX IF NOT EXISTS idx_onto_documents_deleted_at ON onto_documents(deleted_at)
  WHERE deleted_at IS NULL;

-- =============================================================================
-- STEP 3: Migrate data from props.body_markdown to content column
-- =============================================================================

-- Migrate body_markdown from props JSON to dedicated content column
UPDATE onto_documents
SET content = props->>'body_markdown'
WHERE props->>'body_markdown' IS NOT NULL
  AND props->>'body_markdown' != ''
  AND content IS NULL;

-- =============================================================================
-- STEP 4: Update search vector to include content column (if applicable)
-- =============================================================================

-- Note: search_vector is a GENERATED column, so we need to alter its expression
-- Drop and recreate the generated column with the new expression that includes content
DO $$
BEGIN
  -- Check if search_vector exists and needs updating
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'onto_documents'
    AND column_name = 'search_vector'
  ) THEN
    -- Drop the existing column
    ALTER TABLE onto_documents DROP COLUMN IF EXISTS search_vector;
  END IF;

  -- Recreate as generated column with content included
  ALTER TABLE onto_documents ADD COLUMN search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(content, '')), 'C') ||
      setweight(to_tsvector('english', coalesce(props::text, '')), 'D')
    ) STORED;

  -- Recreate the GIN index for full-text search
  CREATE INDEX IF NOT EXISTS idx_onto_documents_search ON onto_documents USING GIN(search_vector);
END $$;
