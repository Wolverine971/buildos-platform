-- Simple query to find all missing templates
-- This will show you exactly which templates need to be created

-- Find all unique type_keys that don't have templates
SELECT DISTINCT
  entity_type,
  scope_needed,
  type_key,
  count_affected
FROM (
  -- Projects missing templates
  SELECT
    'onto_projects' as entity_type,
    'project' as scope_needed,
    p.type_key,
    COUNT(*) as count_affected
  FROM onto_projects p
  WHERE p.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = p.type_key
      AND t.scope = 'project'
    )
  GROUP BY p.type_key

  UNION ALL

  -- Tasks with type_key in props missing templates
  SELECT
    'onto_tasks' as entity_type,
    'task' as scope_needed,
    (t.props->>'type_key')::text as type_key,
    COUNT(*) as count_affected
  FROM onto_tasks t
  WHERE t.props->>'type_key' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates tpl
      WHERE tpl.type_key = (t.props->>'type_key')::text
      AND tpl.scope = 'task'
    )
  GROUP BY (t.props->>'type_key')::text

  UNION ALL

  -- Plans missing templates
  SELECT
    'onto_plans' as entity_type,
    'plan' as scope_needed,
    p.type_key,
    COUNT(*) as count_affected
  FROM onto_plans p
  WHERE p.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = p.type_key
      AND t.scope = 'plan'
    )
  GROUP BY p.type_key

  UNION ALL

  -- Outputs missing templates
  SELECT
    'onto_outputs' as entity_type,
    'output' as scope_needed,
    o.type_key,
    COUNT(*) as count_affected
  FROM onto_outputs o
  WHERE o.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = o.type_key
      AND t.scope = 'output'
    )
  GROUP BY o.type_key

  UNION ALL

  -- Documents missing templates
  SELECT
    'onto_documents' as entity_type,
    'document' as scope_needed,
    d.type_key,
    COUNT(*) as count_affected
  FROM onto_documents d
  WHERE d.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = d.type_key
      AND t.scope = 'document'
    )
  GROUP BY d.type_key

  UNION ALL

  -- Goals missing templates
  SELECT
    'onto_goals' as entity_type,
    'goal' as scope_needed,
    g.type_key,
    COUNT(*) as count_affected
  FROM onto_goals g
  WHERE g.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = g.type_key
      AND t.scope = 'goal'
    )
  GROUP BY g.type_key
) missing
WHERE type_key IS NOT NULL
ORDER BY entity_type, type_key;