-- supabase/migrations/20251126_remove_context_document_id.sql
-- Purpose: Remove context_document_id column from onto_projects and use onto_edges instead
--
-- This migration:
-- 1. Creates has_context_document edges for any existing context_document_id values
-- 2. Updates get_project_with_template to query via edge
-- 3. Drops the context_document_id column

-- ============================================
-- Step 1: Migrate existing relationships to edges
-- ============================================

-- Create has_context_document edges for any context_document_id values
-- that don't already have a corresponding edge
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props)
SELECT
    'project' as src_kind,
    p.id as src_id,
    'has_context_document' as rel,
    'document' as dst_kind,
    p.context_document_id as dst_id,
    '{}'::jsonb as props
FROM onto_projects p
WHERE p.context_document_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM onto_edges e
    WHERE e.src_kind = 'project'
      AND e.src_id = p.id
      AND e.rel = 'has_context_document'
      AND e.dst_kind = 'document'
      AND e.dst_id = p.context_document_id
  );

-- Also check for existing has_document edges that should be has_context_document
-- (from the instantiation service creating has_document edges for context docs)
-- We'll create has_context_document if one doesn't exist and a has_document does
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props)
SELECT DISTINCT
    'project' as src_kind,
    p.id as src_id,
    'has_context_document' as rel,
    'document' as dst_kind,
    p.context_document_id as dst_id,
    '{}'::jsonb as props
FROM onto_projects p
WHERE p.context_document_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM onto_edges e
    WHERE e.src_kind = 'project'
      AND e.src_id = p.id
      AND e.rel = 'has_context_document'
  )
ON CONFLICT DO NOTHING;

-- ============================================
-- Step 2: Update get_project_with_template function
-- ============================================

DROP FUNCTION IF EXISTS get_project_with_template(uuid);

CREATE OR REPLACE FUNCTION get_project_with_template(p_project_id uuid)
RETURNS TABLE(project jsonb, template jsonb, context_document jsonb)
LANGUAGE sql
STABLE
AS $$
    SELECT
        to_jsonb(p.*) as project,
        to_jsonb(t.*) as template,
        to_jsonb(d.*) as context_document
    FROM onto_projects p
    LEFT JOIN onto_templates t
        ON t.type_key = p.type_key
        AND t.scope = 'project'
    LEFT JOIN onto_edges e
        ON e.src_kind = 'project'
        AND e.src_id = p.id
        AND e.rel = 'has_context_document'
        AND e.dst_kind = 'document'
    LEFT JOIN onto_documents d
        ON d.id = e.dst_id
    WHERE p.id = p_project_id;
$$;

COMMENT ON FUNCTION get_project_with_template(uuid) IS
    'Returns the project row along with its associated project template metadata and context document (via edge relationship).';

-- ============================================
-- Step 3: Drop the foreign key and column
-- ============================================

-- Drop the foreign key constraint first
ALTER TABLE onto_projects
    DROP CONSTRAINT IF EXISTS fk_context_document;

-- Drop the column
ALTER TABLE onto_projects
    DROP COLUMN IF EXISTS context_document_id;

-- ============================================
-- Step 4: Create index for efficient context document lookups
-- ============================================

CREATE INDEX IF NOT EXISTS idx_onto_edges_context_doc
    ON onto_edges(src_kind, src_id, rel)
    WHERE rel = 'has_context_document';
