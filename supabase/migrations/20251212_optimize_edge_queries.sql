-- supabase/migrations/20251212_optimize_edge_queries.sql
-- Migration: Optimize onto_edges query performance
-- Date: 2025-12-12
-- Description: Adds composite indexes for common edge query patterns

-- ============================================================================
-- 1. ADD COMPOSITE INDEX FOR FULL EDGE LOOKUPS
-- Used when querying edges by all four identifying columns
-- Example: Finding context documents for projects
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_onto_edges_src_rel_dst
  ON onto_edges(src_kind, src_id, rel, dst_kind);

-- ============================================================================
-- 2. ADD INDEX FOR REVERSE LOOKUPS (dst -> src)
-- Used when finding entities that point TO a given entity
-- Example: Finding all tasks that belong to a plan
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_onto_edges_dst_rel_src
  ON onto_edges(dst_kind, dst_id, rel, src_kind);

-- ============================================================================
-- 3. ADD INDEX FOR REL + SRC_KIND PATTERN
-- Used when filtering by relationship type and source entity kind
-- Example: Finding all 'belongs_to_plan' edges from tasks
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_onto_edges_rel_src_kind
  ON onto_edges(rel, src_kind);

-- ============================================================================
-- VERIFICATION (commented out, for manual testing)
-- ============================================================================

-- Check index usage with EXPLAIN ANALYZE:
-- EXPLAIN ANALYZE SELECT * FROM onto_edges
--   WHERE src_kind = 'project' AND src_id = 'uuid' AND rel = 'has_context_document' AND dst_kind = 'document';

DO $$
BEGIN
  RAISE NOTICE 'Edge query indexes created successfully';
  RAISE NOTICE 'New indexes: idx_onto_edges_src_rel_dst, idx_onto_edges_dst_rel_src, idx_onto_edges_rel_src_kind';
END$$;
