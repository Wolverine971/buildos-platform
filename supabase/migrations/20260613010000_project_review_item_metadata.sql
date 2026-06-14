-- supabase/migrations/20260613010000_project_review_item_metadata.sql
-- Project Review metadata for Project Loops.
--
-- These additive fields move project_suggestions toward review items that can
-- explain why they surfaced, show source evidence, preview impact, and support
-- freshness/undo/correction flows.

ALTER TABLE IF EXISTS project_suggestions
  ADD COLUMN IF NOT EXISTS why_now text,
  ADD COLUMN IF NOT EXISTS evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preview jsonb,
  ADD COLUMN IF NOT EXISTS freshness_state text NOT NULL DEFAULT 'unknown'
    CHECK (freshness_state IN ('fresh', 'changed', 'stale', 'unknown')),
  ADD COLUMN IF NOT EXISTS reversible boolean,
  ADD COLUMN IF NOT EXISTS undo_operations jsonb,
  ADD COLUMN IF NOT EXISTS source_fingerprint text,
  ADD COLUMN IF NOT EXISTS user_feedback jsonb;

CREATE INDEX IF NOT EXISTS idx_project_suggestions_freshness
  ON project_suggestions(project_id, freshness_state)
  WHERE status = 'pending';
