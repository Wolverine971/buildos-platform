-- apps/web/scripts/analyze-template-realms.sql
-- Query to analyze which templates have realms and which are missing
-- Run against your Supabase database to understand realm coverage

-- ============================================
-- 1. SUMMARY: Templates by Scope with Realm Coverage
-- ============================================
SELECT
    scope,
    COUNT(*) AS total_templates,
    COUNT(metadata->>'realm') AS with_realm,
    COUNT(*) - COUNT(metadata->>'realm') AS missing_realm,
    ROUND(
        (COUNT(metadata->>'realm')::numeric / COUNT(*)::numeric) * 100,
        1
    ) AS realm_coverage_pct
FROM onto_templates
WHERE status = 'active'
GROUP BY scope
ORDER BY scope;

-- ============================================
-- 2. REALM DISTRIBUTION: All unique realms by scope
-- ============================================
SELECT
    scope,
    COALESCE(metadata->>'realm', '<<MISSING>>') AS realm,
    COUNT(*) AS template_count,
    ARRAY_AGG(type_key ORDER BY type_key) AS type_keys
FROM onto_templates
WHERE status = 'active'
GROUP BY scope, metadata->>'realm'
ORDER BY scope, realm;

-- ============================================
-- 3. TEMPLATES MISSING REALM: Detail view
-- ============================================
SELECT
    id,
    scope,
    type_key,
    name,
    is_abstract,
    created_at,
    metadata
FROM onto_templates
WHERE status = 'active'
  AND (metadata->>'realm' IS NULL OR metadata->>'realm' = '')
ORDER BY scope, type_key;

-- ============================================
-- 4. REALM VALUES: Distinct realm values used
-- ============================================
SELECT DISTINCT
    metadata->>'realm' AS realm,
    COUNT(*) AS usage_count
FROM onto_templates
WHERE status = 'active'
  AND metadata->>'realm' IS NOT NULL
  AND metadata->>'realm' != ''
GROUP BY metadata->>'realm'
ORDER BY usage_count DESC, realm;

-- ============================================
-- 5. TEMPLATES BY SCOPE WITH REALM (detailed)
-- ============================================
-- PROJECT templates
SELECT
    type_key,
    name,
    COALESCE(metadata->>'realm', '<<MISSING>>') AS realm,
    is_abstract,
    metadata->>'description' AS description
FROM onto_templates
WHERE scope = 'project' AND status = 'active'
ORDER BY realm, type_key;

-- PLAN templates
SELECT
    type_key,
    name,
    COALESCE(metadata->>'realm', '<<MISSING>>') AS realm,
    is_abstract,
    metadata->>'description' AS description
FROM onto_templates
WHERE scope = 'plan' AND status = 'active'
ORDER BY realm, type_key;

-- TASK templates
SELECT
    type_key,
    name,
    COALESCE(metadata->>'realm', '<<MISSING>>') AS realm,
    is_abstract,
    metadata->>'description' AS description
FROM onto_templates
WHERE scope = 'task' AND status = 'active'
ORDER BY realm, type_key;

-- OUTPUT/DELIVERABLE templates
SELECT
    type_key,
    name,
    COALESCE(metadata->>'realm', '<<MISSING>>') AS realm,
    is_abstract,
    metadata->>'description' AS description
FROM onto_templates
WHERE scope IN ('output', 'deliverable') AND status = 'active'
ORDER BY realm, type_key;

-- ============================================
-- 6. RECENTLY CREATED TEMPLATES (check if new ones have realms)
-- ============================================
SELECT
    scope,
    type_key,
    name,
    COALESCE(metadata->>'realm', '<<MISSING>>') AS realm,
    metadata->>'created_by_find_or_create' AS auto_created,
    created_at
FROM onto_templates
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;

-- ============================================
-- 7. CROSS-TAB: Scope vs Realm matrix
-- ============================================
SELECT
    scope,
    COUNT(*) FILTER (WHERE metadata->>'realm' = 'productivity') AS productivity,
    COUNT(*) FILTER (WHERE metadata->>'realm' = 'goals') AS goals,
    COUNT(*) FILTER (WHERE metadata->>'realm' = 'creative') AS creative,
    COUNT(*) FILTER (WHERE metadata->>'realm' = 'output') AS output,
    COUNT(*) FILTER (WHERE metadata->>'realm' = 'general') AS general,
    COUNT(*) FILTER (WHERE metadata->>'realm' = 'education') AS education,
    COUNT(*) FILTER (WHERE metadata->>'realm' = 'marketing') AS marketing,
    COUNT(*) FILTER (WHERE metadata->>'realm' = 'design') AS design,
    COUNT(*) FILTER (WHERE metadata->>'realm' = 'speaking') AS speaking,
    COUNT(*) FILTER (WHERE metadata->>'realm' = 'migration') AS migration,
    COUNT(*) FILTER (WHERE metadata->>'realm' IS NULL OR metadata->>'realm' = '') AS missing
FROM onto_templates
WHERE status = 'active'
GROUP BY scope
ORDER BY scope;
