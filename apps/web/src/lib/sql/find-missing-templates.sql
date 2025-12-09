-- apps/web/src/lib/sql/find-missing-templates.sql
-- Find Missing Templates Query
-- This query identifies all entities that reference templates that don't exist
-- Run this to find which templates need to be created in a migration

-- Summary of missing templates by entity type and scope
WITH missing_templates AS (
  -- Projects with missing templates
  SELECT
    'project' as entity_type,
    'project' as expected_scope,
    p.type_key,
    COUNT(*) as entity_count,
    array_agg(DISTINCT p.id) as entity_ids
  FROM onto_projects p
  WHERE p.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = p.type_key
      AND t.scope = 'project'
    )
  GROUP BY p.type_key

  UNION ALL

  -- Tasks with missing templates (tasks can have type_key in props)
  SELECT
    'task' as entity_type,
    'task' as expected_scope,
    (t.props->>'type_key')::text as type_key,
    COUNT(*) as entity_count,
    array_agg(DISTINCT t.id) as entity_ids
  FROM onto_tasks t
  WHERE t.props->>'type_key' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates tpl
      WHERE tpl.type_key = (t.props->>'type_key')::text
      AND tpl.scope = 'task'
    )
  GROUP BY (t.props->>'type_key')::text

  UNION ALL

  -- Plans with missing templates
  SELECT
    'plan' as entity_type,
    'plan' as expected_scope,
    p.type_key,
    COUNT(*) as entity_count,
    array_agg(DISTINCT p.id) as entity_ids
  FROM onto_plans p
  WHERE p.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = p.type_key
      AND t.scope = 'plan'
    )
  GROUP BY p.type_key

  UNION ALL

  -- Outputs with missing templates
  SELECT
    'output' as entity_type,
    'output' as expected_scope,
    o.type_key,
    COUNT(*) as entity_count,
    array_agg(DISTINCT o.id) as entity_ids
  FROM onto_outputs o
  WHERE o.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = o.type_key
      AND t.scope = 'output'
    )
  GROUP BY o.type_key

  UNION ALL

  -- Documents with missing templates
  SELECT
    'document' as entity_type,
    'document' as expected_scope,
    d.type_key,
    COUNT(*) as entity_count,
    array_agg(DISTINCT d.id) as entity_ids
  FROM onto_documents d
  WHERE d.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = d.type_key
      AND t.scope = 'document'
    )
  GROUP BY d.type_key

  UNION ALL

  -- Goals with missing templates
  SELECT
    'goal' as entity_type,
    'goal' as expected_scope,
    g.type_key,
    COUNT(*) as entity_count,
    array_agg(DISTINCT g.id) as entity_ids
  FROM onto_goals g
  WHERE g.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = g.type_key
      AND t.scope = 'goal'
    )
  GROUP BY g.type_key

  UNION ALL

  -- Requirements with missing templates (if they have type_key)
  SELECT
    'requirement' as entity_type,
    'requirement' as expected_scope,
    r.type_key,
    COUNT(*) as entity_count,
    array_agg(DISTINCT r.id) as entity_ids
  FROM onto_requirements r
  WHERE r.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = r.type_key
      AND t.scope = 'requirement'
    )
  GROUP BY r.type_key
)
SELECT
  entity_type,
  expected_scope,
  type_key,
  entity_count,
  entity_ids[1:5] as sample_entity_ids -- Show first 5 entity IDs as examples
FROM missing_templates
WHERE type_key IS NOT NULL
ORDER BY entity_type, type_key;

-- Detailed query to show sample data for each missing template
-- This helps understand what props these entities have so we can create appropriate templates
WITH missing_template_samples AS (
  -- Get sample project data
  SELECT DISTINCT ON (p.type_key)
    'project' as entity_type,
    p.type_key,
    p.id,
    p.name,
    p.props,
    p.created_at
  FROM onto_projects p
  WHERE p.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = p.type_key
      AND t.scope = 'project'
    )
  ORDER BY p.type_key, p.created_at DESC

  UNION ALL

  -- Get sample task data (tasks with type_key in props)
  SELECT DISTINCT ON ((t.props->>'type_key')::text)
    'task' as entity_type,
    (t.props->>'type_key')::text as type_key,
    t.id,
    t.title as name,
    t.props,
    t.created_at
  FROM onto_tasks t
  WHERE t.props->>'type_key' IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates tpl
      WHERE tpl.type_key = (t.props->>'type_key')::text
      AND tpl.scope = 'task'
    )
  ORDER BY (t.props->>'type_key')::text, t.created_at DESC

  UNION ALL

  -- Get sample plan data
  SELECT DISTINCT ON (p.type_key)
    'plan' as entity_type,
    p.type_key,
    p.id,
    p.name,
    p.props,
    p.created_at
  FROM onto_plans p
  WHERE p.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = p.type_key
      AND t.scope = 'plan'
    )
  ORDER BY p.type_key, p.created_at DESC

  UNION ALL

  -- Get sample output data
  SELECT DISTINCT ON (o.type_key)
    'output' as entity_type,
    o.type_key,
    o.id,
    o.name,
    o.props,
    o.created_at
  FROM onto_outputs o
  WHERE o.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = o.type_key
      AND t.scope = 'output'
    )
  ORDER BY o.type_key, o.created_at DESC

  UNION ALL

  -- Get sample document data
  SELECT DISTINCT ON (d.type_key)
    'document' as entity_type,
    d.type_key,
    d.id,
    d.title as name,
    d.props,
    d.created_at
  FROM onto_documents d
  WHERE d.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = d.type_key
      AND t.scope = 'document'
    )
  ORDER BY d.type_key, d.created_at DESC

  UNION ALL

  -- Get sample goal data
  SELECT DISTINCT ON (g.type_key)
    'goal' as entity_type,
    g.type_key,
    g.id,
    g.name,
    g.props,
    g.created_at
  FROM onto_goals g
  WHERE g.type_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM onto_templates t
      WHERE t.type_key = g.type_key
      AND t.scope = 'goal'
    )
  ORDER BY g.type_key, g.created_at DESC
)
SELECT
  entity_type,
  type_key,
  id as sample_entity_id,
  name as sample_name,
  jsonb_pretty(props) as sample_props
FROM missing_template_samples
ORDER BY entity_type, type_key;

-- Check for templates that exist but in wrong scope (scope mismatch)
WITH scope_mismatches AS (
  SELECT
    'project' as entity_type,
    p.type_key,
    t.scope as existing_scope,
    'project' as expected_scope,
    COUNT(DISTINCT p.id) as affected_count
  FROM onto_projects p
  JOIN onto_templates t ON t.type_key = p.type_key
  WHERE p.type_key IS NOT NULL
    AND t.scope != 'project'
  GROUP BY p.type_key, t.scope

  UNION ALL

  SELECT
    'output' as entity_type,
    o.type_key,
    t.scope as existing_scope,
    'output' as expected_scope,
    COUNT(DISTINCT o.id) as affected_count
  FROM onto_outputs o
  JOIN onto_templates t ON t.type_key = o.type_key
  WHERE o.type_key IS NOT NULL
    AND t.scope != 'output'
  GROUP BY o.type_key, t.scope

  UNION ALL

  SELECT
    'document' as entity_type,
    d.type_key,
    t.scope as existing_scope,
    'document' as expected_scope,
    COUNT(DISTINCT d.id) as affected_count
  FROM onto_documents d
  JOIN onto_templates t ON t.type_key = d.type_key
  WHERE d.type_key IS NOT NULL
    AND t.scope != 'document'
  GROUP BY d.type_key, t.scope

  UNION ALL

  SELECT
    'plan' as entity_type,
    p.type_key,
    t.scope as existing_scope,
    'plan' as expected_scope,
    COUNT(DISTINCT p.id) as affected_count
  FROM onto_plans p
  JOIN onto_templates t ON t.type_key = p.type_key
  WHERE p.type_key IS NOT NULL
    AND t.scope != 'plan'
  GROUP BY p.type_key, t.scope

  UNION ALL

  SELECT
    'goal' as entity_type,
    g.type_key,
    t.scope as existing_scope,
    'goal' as expected_scope,
    COUNT(DISTINCT g.id) as affected_count
  FROM onto_goals g
  JOIN onto_templates t ON t.type_key = g.type_key
  WHERE g.type_key IS NOT NULL
    AND t.scope != 'goal'
  GROUP BY g.type_key, t.scope
)
SELECT * FROM scope_mismatches
ORDER BY entity_type, type_key;

-- Summary statistics
SELECT
  'Total Missing Templates' as metric,
  COUNT(DISTINCT type_key || '-' || expected_scope) as value
FROM (
  SELECT DISTINCT
    type_key,
    expected_scope
  FROM missing_templates
) t;