-- Migration: Cleanup Remaining Task Document Type Keys
-- Date: 2025-11-20
-- Description: Fixes any remaining documents with old task.spec/task.scratch patterns

-- ============================================
-- Fix any remaining document.task.spec and document.task.scratch
-- ============================================

-- Convert document.task.spec to task.documentation
UPDATE onto_documents
SET
  type_key = 'task.documentation',
  props = jsonb_set(
    COALESCE(props, '{}'::jsonb),
    '{doc_type}',
    '"spec"'
  )
WHERE type_key IN ('document.task.spec', 'document.task.specs');

-- Convert document.task.scratch to task.documentation
UPDATE onto_documents
SET
  type_key = 'task.documentation',
  props = jsonb_set(
    COALESCE(props, '{}'::jsonb),
    '{doc_type}',
    '"scratch"'
  )
WHERE type_key = 'document.task.scratch';

-- Also handle any that might just be 'task.spec' or 'task.scratch' without 'document.' prefix
UPDATE onto_documents
SET
  type_key = 'task.documentation',
  props = jsonb_set(
    COALESCE(props, '{}'::jsonb),
    '{doc_type}',
    '"spec"'
  )
WHERE type_key = 'task.spec';

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
-- Create edges for newly converted documents
-- ============================================

-- Create edges for converted documents that have related_tasks in props
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
    'created_from_cleanup_migration', true
  ) as props
FROM onto_documents d,
  jsonb_array_elements_text(d.props->'related_tasks') as task_id
WHERE d.type_key = 'task.documentation'
  AND d.props->'related_tasks' IS NOT NULL
  AND jsonb_array_length(d.props->'related_tasks') > 0
  AND NOT EXISTS (
    SELECT 1 FROM onto_edges e
    WHERE e.src_kind = 'document'
      AND e.src_id = d.id
      AND e.dst_kind = 'task'
      AND e.dst_id = task_id::uuid
      AND e.rel = 'relates_to'
  )
ON CONFLICT DO NOTHING;

-- ============================================
-- Report results
-- ============================================

DO $$
DECLARE
  v_converted_count integer;
  v_edges_created integer;
BEGIN
  -- Count documents with task.documentation type_key
  SELECT COUNT(*) INTO v_converted_count
  FROM onto_documents
  WHERE type_key = 'task.documentation';

  -- Count total edges
  SELECT COUNT(*) INTO v_edges_created
  FROM onto_edges
  WHERE src_kind = 'document'
    AND dst_kind = 'task'
    AND rel = 'relates_to';

  RAISE NOTICE 'Cleanup Migration Complete:';
  RAISE NOTICE '  - Total task.documentation documents: %', v_converted_count;
  RAISE NOTICE '  - Total task-document edges: %', v_edges_created;

  -- Check for any remaining old type_keys
  IF EXISTS (
    SELECT 1 FROM onto_documents
    WHERE type_key IN ('task.spec', 'task.scratch', 'document.task.spec', 'document.task.scratch', 'document.task.specs')
  ) THEN
    RAISE WARNING 'Some documents still have old type_keys. Please investigate.';
  ELSE
    RAISE NOTICE '  - All old type_keys have been converted successfully!';
  END IF;
END $$;