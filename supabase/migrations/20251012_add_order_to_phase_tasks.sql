-- =====================================================
-- PHASE TASK ORDERING
-- =====================================================
-- Adds explicit "order" column to phase_tasks to track task sequencing
-- Enables parallel task groups (same order value) and deterministic sorting
-- =====================================================

ALTER TABLE phase_tasks
ADD COLUMN "order" INTEGER DEFAULT 0 NOT NULL;

-- Backfill existing records with sequential order within each phase
WITH ordered_phase_tasks AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY phase_id
      ORDER BY
        COALESCE(suggested_start_date, '1970-01-01'::DATE),
        created_at,
        id
    ) - 1 AS position
  FROM phase_tasks
)
UPDATE phase_tasks AS pt
SET "order" = opt.position
FROM ordered_phase_tasks AS opt
WHERE pt.id = opt.id;

-- Index to support ordering queries inside phases
CREATE INDEX IF NOT EXISTS idx_phase_tasks_phase_order
ON phase_tasks(phase_id, "order");

-- Documentation
COMMENT ON COLUMN phase_tasks."order" IS
'Task execution order within a phase. Tasks sharing the same value can be completed in parallel.';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
