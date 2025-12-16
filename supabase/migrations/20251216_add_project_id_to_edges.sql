-- supabase/migrations/20251216_add_project_id_to_edges.sql
-- Migration: Add project_id to onto_edges
-- Purpose: Enable efficient project-scoped edge queries
--
-- This migration:
-- 1. Adds project_id column to onto_edges
-- 2. Creates an index for efficient project-scoped lookups
-- 3. Backfills existing edges by deriving project_id from source entities
-- 4. Makes the column NOT NULL after backfill
--
-- IMPORTANT: Run AFTER 20251216_normalize_edge_directions.sql
-- Edge direction normalization must happen first to ensure correct project_id derivation.
--
-- See: docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md

-- Step 1: Add project_id column (nullable initially for backfill)
ALTER TABLE onto_edges
ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES onto_projects(id) ON DELETE CASCADE;

-- Step 2: Create index for efficient project-scoped queries
-- This enables O(1) lookups: SELECT * FROM onto_edges WHERE project_id = ?
CREATE INDEX IF NOT EXISTS idx_onto_edges_project ON onto_edges(project_id);

-- Step 3: Backfill existing edges by deriving project_id from source entity
-- The source entity is used because edges follow canonical direction (parent → child)
-- after the edge normalization migration.
--
-- IMPORTANT: Each UPDATE validates that the derived project_id actually exists
-- in onto_projects. This handles orphaned entities (entities whose project was deleted).

-- 3a. Plans as source (with project existence validation)
UPDATE onto_edges e
SET project_id = p.project_id
FROM onto_plans p
INNER JOIN onto_projects proj ON proj.id = p.project_id
WHERE e.src_kind = 'plan' AND e.src_id = p.id AND e.project_id IS NULL;

-- 3b. Tasks as source (with project existence validation)
UPDATE onto_edges e
SET project_id = t.project_id
FROM onto_tasks t
INNER JOIN onto_projects proj ON proj.id = t.project_id
WHERE e.src_kind = 'task' AND e.src_id = t.id AND e.project_id IS NULL;

-- 3c. Goals as source (with project existence validation)
UPDATE onto_edges e
SET project_id = g.project_id
FROM onto_goals g
INNER JOIN onto_projects proj ON proj.id = g.project_id
WHERE e.src_kind = 'goal' AND e.src_id = g.id AND e.project_id IS NULL;

-- 3d. Milestones as source (with project existence validation)
UPDATE onto_edges e
SET project_id = m.project_id
FROM onto_milestones m
INNER JOIN onto_projects proj ON proj.id = m.project_id
WHERE e.src_kind = 'milestone' AND e.src_id = m.id AND e.project_id IS NULL;

-- 3e. Outputs as source (with project existence validation)
UPDATE onto_edges e
SET project_id = o.project_id
FROM onto_outputs o
INNER JOIN onto_projects proj ON proj.id = o.project_id
WHERE e.src_kind = 'output' AND e.src_id = o.id AND e.project_id IS NULL;

-- 3f. Documents as source (with project existence validation)
UPDATE onto_edges e
SET project_id = d.project_id
FROM onto_documents d
INNER JOIN onto_projects proj ON proj.id = d.project_id
WHERE e.src_kind = 'document' AND e.src_id = d.id AND e.project_id IS NULL;

-- 3g. Risks as source (with project existence validation)
UPDATE onto_edges e
SET project_id = r.project_id
FROM onto_risks r
INNER JOIN onto_projects proj ON proj.id = r.project_id
WHERE e.src_kind = 'risk' AND e.src_id = r.id AND e.project_id IS NULL;

-- 3h. Decisions as source (with project existence validation)
UPDATE onto_edges e
SET project_id = dec.project_id
FROM onto_decisions dec
INNER JOIN onto_projects proj ON proj.id = dec.project_id
WHERE e.src_kind = 'decision' AND e.src_id = dec.id AND e.project_id IS NULL;

-- 3i. Projects as source (edge from project to child)
-- When project is the source, project_id = src_id (validate project exists)
UPDATE onto_edges e
SET project_id = e.src_id
FROM onto_projects proj
WHERE e.src_kind = 'project' AND e.src_id = proj.id AND e.project_id IS NULL;

-- Step 4: Handle remaining edges by checking destination entity
-- This catches edges where the source entity was deleted but edge remains

-- 4a. Plans as destination (with project existence validation)
UPDATE onto_edges e
SET project_id = p.project_id
FROM onto_plans p
INNER JOIN onto_projects proj ON proj.id = p.project_id
WHERE e.dst_kind = 'plan' AND e.dst_id = p.id AND e.project_id IS NULL;

-- 4b. Tasks as destination (with project existence validation)
UPDATE onto_edges e
SET project_id = t.project_id
FROM onto_tasks t
INNER JOIN onto_projects proj ON proj.id = t.project_id
WHERE e.dst_kind = 'task' AND e.dst_id = t.id AND e.project_id IS NULL;

-- 4c. Goals as destination (with project existence validation)
UPDATE onto_edges e
SET project_id = g.project_id
FROM onto_goals g
INNER JOIN onto_projects proj ON proj.id = g.project_id
WHERE e.dst_kind = 'goal' AND e.dst_id = g.id AND e.project_id IS NULL;

-- 4d. Milestones as destination (with project existence validation)
UPDATE onto_edges e
SET project_id = m.project_id
FROM onto_milestones m
INNER JOIN onto_projects proj ON proj.id = m.project_id
WHERE e.dst_kind = 'milestone' AND e.dst_id = m.id AND e.project_id IS NULL;

-- 4e. Outputs as destination (with project existence validation)
UPDATE onto_edges e
SET project_id = o.project_id
FROM onto_outputs o
INNER JOIN onto_projects proj ON proj.id = o.project_id
WHERE e.dst_kind = 'output' AND e.dst_id = o.id AND e.project_id IS NULL;

-- 4f. Documents as destination (with project existence validation)
UPDATE onto_edges e
SET project_id = d.project_id
FROM onto_documents d
INNER JOIN onto_projects proj ON proj.id = d.project_id
WHERE e.dst_kind = 'document' AND e.dst_id = d.id AND e.project_id IS NULL;

-- 4g. Risks as destination (with project existence validation)
UPDATE onto_edges e
SET project_id = r.project_id
FROM onto_risks r
INNER JOIN onto_projects proj ON proj.id = r.project_id
WHERE e.dst_kind = 'risk' AND e.dst_id = r.id AND e.project_id IS NULL;

-- 4h. Decisions as destination (with project existence validation)
UPDATE onto_edges e
SET project_id = dec.project_id
FROM onto_decisions dec
INNER JOIN onto_projects proj ON proj.id = dec.project_id
WHERE e.dst_kind = 'decision' AND e.dst_id = dec.id AND e.project_id IS NULL;

-- 4i. Projects as destination (validate project exists)
UPDATE onto_edges e
SET project_id = e.dst_id
FROM onto_projects proj
WHERE e.dst_kind = 'project' AND e.dst_id = proj.id AND e.project_id IS NULL;

-- Step 5: Log orphaned edges before deletion (for debugging)
DO $$
DECLARE
  orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM onto_edges WHERE project_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE NOTICE 'Found % orphaned edges (referencing deleted projects or non-existent entities). These will be deleted.', orphan_count;
  END IF;
END $$;

-- Step 6: Delete orphan edges that couldn't be assigned a project_id
-- These are edges where:
-- - Both source and destination entities were deleted
-- - The entities exist but their project was deleted (orphaned entities)
DELETE FROM onto_edges WHERE project_id IS NULL;

-- Step 7: Make the column NOT NULL now that all edges have project_id
ALTER TABLE onto_edges ALTER COLUMN project_id SET NOT NULL;

-- Step 8: Add documentation comment
COMMENT ON COLUMN onto_edges.project_id IS
  'Denormalized project reference for efficient project-scoped queries. '
  'Set at edge creation time, never modified afterward. '
  'Derived from the source entity (after direction normalization). '
  'See: docs/specs/PROJECT_GRAPH_QUERY_PATTERN_SPEC.md';

-- Step 9: Log migration summary
DO $$
DECLARE
  edge_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO edge_count FROM onto_edges;
  RAISE NOTICE 'Migration complete. Total edges with project_id: %', edge_count;
END $$;
