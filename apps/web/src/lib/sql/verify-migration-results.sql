-- Verification Script for Task Documentation Migration
-- Run this to verify the migration completed successfully

-- ============================================
-- 1. Check Templates Created
-- ============================================

SELECT 'Templates Created:' as check_type, '' as details
UNION ALL
SELECT
  '  ' || scope || '.' || type_key as check_type,
  name as details
FROM onto_templates
WHERE type_key IN (
  'project.context',
  'meeting.brief',
  'marketing.strategy',
  'task.documentation',
  'output.research.database',
  'output.research.profile',
  'output.research.visualization',
  'output.book',
  'project.community.forum'
)
ORDER BY 1;

-- ============================================
-- 2. Check Documents Converted
-- ============================================

SELECT '' as separator;
SELECT 'Documents with task.documentation type_key:' as check_type, COUNT(*)::text as count
FROM onto_documents
WHERE type_key = 'task.documentation';

-- Show sample of converted documents
SELECT
  'Sample converted docs:' as check_type,
  '' as details
UNION ALL
SELECT
  '  ' || substring(id::text, 1, 8) || '...' as check_type,
  title || ' (doc_type: ' || COALESCE(props->>'doc_type', 'null') || ')' as details
FROM onto_documents
WHERE type_key = 'task.documentation'
LIMIT 5;

-- ============================================
-- 3. Check for Remaining Old Type Keys
-- ============================================

SELECT '' as separator;
SELECT 'Documents still with OLD type_keys:' as check_type, '' as details;

SELECT
  type_key,
  COUNT(*) as count,
  string_agg(substring(id::text, 1, 8), ', ') as sample_ids
FROM onto_documents
WHERE type_key IN ('task.spec', 'task.scratch', 'document.task.spec', 'document.task.scratch')
GROUP BY type_key;

-- ============================================
-- 4. Check Edge Relationships Created
-- ============================================

SELECT '' as separator;
SELECT 'Task-Document Edge Relationships:' as check_type, '' as details;

SELECT
  'Total edges created' as metric,
  COUNT(*)::text as value
FROM onto_edges
WHERE src_kind = 'document'
  AND dst_kind = 'task'
  AND rel = 'relates_to'
UNION ALL
SELECT
  'From migration' as metric,
  COUNT(*)::text as value
FROM onto_edges
WHERE src_kind = 'document'
  AND dst_kind = 'task'
  AND rel = 'relates_to'
  AND props->>'created_from_migration' = 'true'
UNION ALL
SELECT
  'Auto-matched' as metric,
  COUNT(*)::text as value
FROM onto_edges
WHERE src_kind = 'document'
  AND dst_kind = 'task'
  AND rel = 'relates_to'
  AND props->>'auto_matched' = 'true';

-- ============================================
-- 5. Test the View
-- ============================================

SELECT '' as separator;
SELECT 'Task Documents View (first 5 rows):' as check_type, '' as details;

SELECT
  substring(task_id::text, 1, 8) || '...' as task_id_short,
  substring(task_title, 1, 30) || CASE WHEN length(task_title) > 30 THEN '...' ELSE '' END as task_title_short,
  substring(document_id::text, 1, 8) || '...' as doc_id_short,
  doc_type,
  document_state
FROM task_documents
LIMIT 5;

-- ============================================
-- 6. Check for Orphaned Documents
-- ============================================

SELECT '' as separator;
SELECT 'Orphaned task.documentation documents (no edges):' as check_type, '' as details;

SELECT
  COUNT(*) as orphaned_count,
  string_agg(substring(d.id::text, 1, 8), ', ') as sample_ids
FROM onto_documents d
WHERE d.type_key = 'task.documentation'
  AND NOT EXISTS (
    SELECT 1 FROM onto_edges e
    WHERE e.src_kind = 'document'
      AND e.src_id = d.id
      AND e.dst_kind = 'task'
  );

-- ============================================
-- 7. Check Output Type Key Fixes
-- ============================================

SELECT '' as separator;
SELECT 'Output type_key fixes:' as check_type, '' as details;

SELECT
  'Outputs with correct type_keys' as metric,
  COUNT(*)::text as value
FROM onto_outputs
WHERE type_key LIKE 'output.%'
UNION ALL
SELECT
  'Outputs with WRONG type_keys' as metric,
  COUNT(*)::text as value
FROM onto_outputs
WHERE type_key LIKE 'document.%';

-- ============================================
-- 8. Summary of Missing Templates
-- ============================================

SELECT '' as separator;
SELECT 'Remaining Missing Templates:' as check_type, '' as details;

WITH missing AS (
  SELECT DISTINCT
    'document' as entity_type,
    d.type_key,
    COUNT(*) as count
  FROM onto_documents d
  WHERE NOT EXISTS (
    SELECT 1 FROM onto_templates t
    WHERE t.type_key = d.type_key
    AND t.scope = 'document'
  )
  GROUP BY d.type_key

  UNION ALL

  SELECT DISTINCT
    'output' as entity_type,
    o.type_key,
    COUNT(*) as count
  FROM onto_outputs o
  WHERE NOT EXISTS (
    SELECT 1 FROM onto_templates t
    WHERE t.type_key = o.type_key
    AND t.scope = 'output'
  )
  GROUP BY o.type_key

  UNION ALL

  SELECT DISTINCT
    'project' as entity_type,
    p.type_key,
    COUNT(*) as count
  FROM onto_projects p
  WHERE p.type_key IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM onto_templates t
    WHERE t.type_key = p.type_key
    AND t.scope = 'project'
  )
  GROUP BY p.type_key
)
SELECT
  entity_type || ': ' || type_key as missing_template,
  '(' || count || ' entities)' as affected_count
FROM missing
WHERE type_key IS NOT NULL
ORDER BY entity_type, type_key;