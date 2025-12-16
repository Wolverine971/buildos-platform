-- supabase/migrations/20251216_normalize_edge_directions.sql
-- Migration: Normalize Edge Directions
-- Convention: Store edges directionally, query bidirectionally
--
-- This migration:
-- 1. Removes redundant reverse edges (e.g., 'belongs_to_plan' when 'has_task' exists)
-- 2. Converts deprecated relationships to canonical forms
-- 3. Ensures consistent edge direction for task-plan relationships
--
-- After this migration, task-plan relationships will only be stored as:
--   plan → task (rel: 'has_task')
-- Instead of bidirectionally:
--   task → plan (rel: 'belongs_to_plan') + plan → task (rel: 'has_task')

-- Step 1: Remove 'belongs_to_plan' edges where a corresponding 'has_task' edge exists
-- This cleans up the redundant reverse edge pattern
DELETE FROM onto_edges e1
WHERE e1.rel = 'belongs_to_plan'
  AND EXISTS (
    SELECT 1 FROM onto_edges e2
    WHERE e2.src_id = e1.dst_id      -- e2.src (plan) = e1.dst (plan)
      AND e2.dst_id = e1.src_id      -- e2.dst (task) = e1.src (task)
      AND e2.rel = 'has_task'
  );

-- Step 2: Convert any remaining 'belongs_to_plan' edges to 'has_task' with swapped direction
-- This handles cases where only the task→plan edge existed without the reverse
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props, created_at)
SELECT
  e.dst_kind,    -- plan becomes source
  e.dst_id,
  'has_task',    -- canonical relationship
  e.src_kind,    -- task becomes destination
  e.src_id,
  e.props,
  e.created_at
FROM onto_edges e
WHERE e.rel = 'belongs_to_plan'
  -- Only convert if no has_task edge exists
  AND NOT EXISTS (
    SELECT 1 FROM onto_edges e2
    WHERE e2.src_id = e.dst_id
      AND e2.dst_id = e.src_id
      AND e2.rel = 'has_task'
  );

-- Step 3: Delete the original 'belongs_to_plan' edges that were just converted
DELETE FROM onto_edges
WHERE rel = 'belongs_to_plan';

-- Step 4: Remove other deprecated reverse edges if they exist alongside canonical edges
-- referenced_by → references
DELETE FROM onto_edges e1
WHERE e1.rel = 'referenced_by'
  AND EXISTS (
    SELECT 1 FROM onto_edges e2
    WHERE e2.src_id = e1.dst_id
      AND e2.dst_id = e1.src_id
      AND e2.rel = 'references'
  );

-- Convert remaining referenced_by to references
INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props, created_at)
SELECT
  e.dst_kind, e.dst_id, 'references', e.src_kind, e.src_id, e.props, e.created_at
FROM onto_edges e
WHERE e.rel = 'referenced_by'
  AND NOT EXISTS (
    SELECT 1 FROM onto_edges e2
    WHERE e2.src_id = e.dst_id AND e2.dst_id = e.src_id AND e2.rel = 'references'
  );

DELETE FROM onto_edges WHERE rel = 'referenced_by';

-- produced_by → produces
DELETE FROM onto_edges e1
WHERE e1.rel = 'produced_by'
  AND EXISTS (
    SELECT 1 FROM onto_edges e2
    WHERE e2.src_id = e1.dst_id
      AND e2.dst_id = e1.src_id
      AND e2.rel = 'produces'
  );

INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props, created_at)
SELECT
  e.dst_kind, e.dst_id, 'produces', e.src_kind, e.src_id, e.props, e.created_at
FROM onto_edges e
WHERE e.rel = 'produced_by'
  AND NOT EXISTS (
    SELECT 1 FROM onto_edges e2
    WHERE e2.src_id = e.dst_id AND e2.dst_id = e.src_id AND e2.rel = 'produces'
  );

DELETE FROM onto_edges WHERE rel = 'produced_by';

-- mitigated_by → mitigates
DELETE FROM onto_edges e1
WHERE e1.rel = 'mitigated_by'
  AND EXISTS (
    SELECT 1 FROM onto_edges e2
    WHERE e2.src_id = e1.dst_id
      AND e2.dst_id = e1.src_id
      AND e2.rel = 'mitigates'
  );

INSERT INTO onto_edges (src_kind, src_id, rel, dst_kind, dst_id, props, created_at)
SELECT
  e.dst_kind, e.dst_id, 'mitigates', e.src_kind, e.src_id, e.props, e.created_at
FROM onto_edges e
WHERE e.rel = 'mitigated_by'
  AND NOT EXISTS (
    SELECT 1 FROM onto_edges e2
    WHERE e2.src_id = e.dst_id AND e2.dst_id = e.src_id AND e2.rel = 'mitigates'
  );

DELETE FROM onto_edges WHERE rel = 'mitigated_by';

-- Log summary of changes (will appear in migration logs)
DO $$
DECLARE
  edge_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO edge_count FROM onto_edges;
  RAISE NOTICE 'Edge normalization complete. Total edges remaining: %', edge_count;
END $$;
