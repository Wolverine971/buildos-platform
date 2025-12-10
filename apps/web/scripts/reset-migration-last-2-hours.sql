-- ============================================================
-- COMPLETE MIGRATION RESET - Last 2 Hours
-- Run this in Supabase SQL Editor
-- ============================================================

BEGIN;

-- 1. Delete ontology data created in the last 2 hours
-- Order matters due to foreign key constraints (delete children first)

-- Delete edges first (references other entities)
DELETE FROM onto_edges
WHERE created_at > NOW() - INTERVAL '2 hours';

-- Delete leaf entities
DELETE FROM onto_milestones
WHERE created_at > NOW() - INTERVAL '2 hours';

DELETE FROM onto_documents
WHERE created_at > NOW() - INTERVAL '2 hours';

DELETE FROM onto_outputs
WHERE created_at > NOW() - INTERVAL '2 hours';

-- Delete tasks
DELETE FROM onto_tasks
WHERE created_at > NOW() - INTERVAL '2 hours';

-- Delete plans
DELETE FROM onto_plans
WHERE created_at > NOW() - INTERVAL '2 hours';

-- Delete goals
DELETE FROM onto_goals
WHERE created_at > NOW() - INTERVAL '2 hours';

-- Delete braindumps (if table exists, will error if not - that's ok)
DELETE FROM onto_braindumps
WHERE created_at > NOW() - INTERVAL '2 hours';

-- Delete projects last (parent of most entities)
DELETE FROM onto_projects
WHERE created_at > NOW() - INTERVAL '2 hours';

-- 2. Clear legacy entity mappings from last 2 hours
DELETE FROM legacy_entity_mappings
WHERE migrated_at > NOW() - INTERVAL '2 hours';

-- 3. Clear all migration logs
DELETE FROM migration_log;

-- 4. Reset the platform lock
UPDATE migration_platform_lock
SET run_id = NULL,
    locked_by = NULL,
    locked_at = NULL,
    expires_at = NULL
WHERE id = 1;

-- 5. Refresh the materialized view
REFRESH MATERIALIZED VIEW user_migration_stats;

COMMIT;

-- Verify the reset
SELECT 'Projects' as entity, COUNT(*) as count FROM onto_projects WHERE created_at > NOW() - INTERVAL '2 hours'
UNION ALL
SELECT 'Tasks', COUNT(*) FROM onto_tasks WHERE created_at > NOW() - INTERVAL '2 hours'
UNION ALL
SELECT 'Mappings', COUNT(*) FROM legacy_entity_mappings WHERE migrated_at > NOW() - INTERVAL '2 hours'
UNION ALL
SELECT 'Logs', COUNT(*) FROM migration_log;
