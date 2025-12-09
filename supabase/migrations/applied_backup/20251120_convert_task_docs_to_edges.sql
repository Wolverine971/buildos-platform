-- supabase/migrations/applied_backup/20251120_convert_task_docs_to_edges.sql
-- Migration: Convert task.spec and task.scratch to document edges
-- Date: 2025-11-20
-- Description: Migrates existing task.spec and task.scratch documents to use the task.documentation template
--              and creates edge relationships between documents and tasks

-- ============================================
-- STEP 1: Update existing task.spec and task.scratch documents
-- ============================================

-- Update task.spec documents to use task.documentation template
UPDATE onto_documents
SET
  type_key = 'task.documentation',
  props = jsonb_set(
    COALESCE(props, '{}'::jsonb),
    '{doc_type}',
    '"spec"'
  )
WHERE type_key = 'task.spec';

-- Update task.scratch documents to use task.documentation template
UPDATE onto_documents
SET
  type_key = 'task.documentation',
  props = jsonb_set(
    COALESCE(props, '{}'::jsonb),
    '{doc_type}',
    '"scratch"'
  )
WHERE type_key = 'task.scratch';

-- ============================================
-- STEP 2: Create edge relationships for existing task documents
-- ============================================

-- Create edges for documents that have related_tasks in their props
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props)
SELECT
  'document' as src_kind,
  d.id as src_id,
  'relates_to' as rel,
  'task' as dst_kind,
  task_id::uuid as dst_id,
  jsonb_build_object(
    'relationship_type', 'documentation',
    'doc_type', d.props->>'doc_type',
    'created_from_migration', true
  ) as props
FROM onto_documents d,
  jsonb_array_elements_text(d.props->'related_tasks') as task_id
WHERE d.type_key = 'task.documentation'
  AND d.props->'related_tasks' IS NOT NULL
  AND jsonb_array_length(d.props->'related_tasks') > 0
  AND NOT EXISTS (
    -- Don't create duplicate edges
    SELECT 1 FROM onto_edges e
    WHERE e.src_kind = 'document'
      AND e.src_id = d.id
      AND e.dst_kind = 'task'
      AND e.dst_id = task_id::uuid
      AND e.rel = 'relates_to'
  );

-- ============================================
-- STEP 3: Find orphaned task documents and link them to tasks
-- ============================================

-- For documents that don't have related_tasks but might be linked through naming or project association
-- This creates edges based on document title matching task title patterns
WITH potential_matches AS (
  SELECT
    d.id as doc_id,
    t.id as task_id,
    d.title as doc_title,
    t.title as task_title,
    similarity(d.title, t.title) as title_similarity
  FROM onto_documents d
  CROSS JOIN onto_tasks t
  WHERE d.type_key = 'task.documentation'
    AND d.project_id = t.project_id
    AND (d.props->'related_tasks' IS NULL OR jsonb_array_length(COALESCE(d.props->'related_tasks', '[]'::jsonb)) = 0)
    AND similarity(d.title, t.title) > 0.3  -- 30% similarity threshold
)
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props)
SELECT DISTINCT ON (doc_id)
  'document' as src_kind,
  doc_id as src_id,
  'relates_to' as rel,
  'task' as dst_kind,
  task_id as dst_id,
  jsonb_build_object(
    'relationship_type', 'documentation',
    'doc_type', d.props->>'doc_type',
    'created_from_migration', true,
    'auto_matched', true,
    'match_confidence', title_similarity
  ) as props
FROM potential_matches pm
JOIN onto_documents d ON d.id = pm.doc_id
WHERE NOT EXISTS (
  -- Don't create duplicate edges
  SELECT 1 FROM onto_edges e
  WHERE e.src_kind = 'document'
    AND e.src_id = pm.doc_id
    AND e.dst_kind = 'task'
    AND e.dst_id = pm.task_id
    AND e.rel = 'relates_to'
)
ORDER BY doc_id, title_similarity DESC;

-- ============================================
-- STEP 4: Add helper function for creating task-document edges
-- ============================================

-- Function to easily link documents to tasks
CREATE OR REPLACE FUNCTION link_document_to_task(
  p_document_id uuid,
  p_task_id uuid,
  p_relationship_type text DEFAULT 'documentation'
)
RETURNS uuid AS $$
DECLARE
  v_edge_id uuid;
BEGIN
  -- Check if edge already exists
  SELECT id INTO v_edge_id
  FROM onto_edges
  WHERE src_kind = 'document'
    AND src_id = p_document_id
    AND dst_kind = 'task'
    AND dst_id = p_task_id
    AND rel = 'relates_to';

  IF v_edge_id IS NOT NULL THEN
    RETURN v_edge_id;
  END IF;

  -- Create new edge
  INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props)
  VALUES (
    'document',
    p_document_id,
    'relates_to',
    'task',
    p_task_id,
    jsonb_build_object(
      'relationship_type', p_relationship_type,
      'created_at', now()
    )
  )
  RETURNING id INTO v_edge_id;

  RETURN v_edge_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- STEP 5: Add helper view for task documents
-- ============================================

-- View to easily query documents related to tasks
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
  d.state_key as document_state,
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
-- STEP 6: Report on migration results
-- ============================================

-- Create a summary of the migration
DO $$
DECLARE
  v_updated_docs integer;
  v_edges_created integer;
  v_auto_matched integer;
BEGIN
  -- Count updated documents
  SELECT COUNT(*) INTO v_updated_docs
  FROM onto_documents
  WHERE type_key = 'task.documentation';

  -- Count edges created
  SELECT COUNT(*) INTO v_edges_created
  FROM onto_edges
  WHERE props->>'created_from_migration' = 'true';

  -- Count auto-matched edges
  SELECT COUNT(*) INTO v_auto_matched
  FROM onto_edges
  WHERE props->>'auto_matched' = 'true';

  RAISE NOTICE 'Migration Summary:';
  RAISE NOTICE '  - Documents updated to task.documentation: %', v_updated_docs;
  RAISE NOTICE '  - Edge relationships created: %', v_edges_created;
  RAISE NOTICE '  - Auto-matched relationships: %', v_auto_matched;
END $$;

-- ============================================
-- STEP 7: Grant appropriate permissions
-- ============================================

-- Grant access to the new view
GRANT SELECT ON task_documents TO authenticated;
GRANT SELECT ON task_documents TO anon;

-- Grant execute on the helper function
GRANT EXECUTE ON FUNCTION link_document_to_task TO authenticated;