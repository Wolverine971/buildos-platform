-- supabase/migrations/20260424000005_ontology_brief_snapshot_constraints.sql
-- Enforce snapshot-safe ontology brief constraints and lookup indexes.
-- - Allow multiple snapshots per user/date, but only one active processing row
-- - Ensure project brief upserts have a concrete unique target
-- - Optimize latest snapshot lookups

-- One project brief row per (daily_brief_id, project_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ontology_project_briefs_daily_brief_project
  ON ontology_project_briefs (daily_brief_id, project_id);

-- One active processing run per user/date scope
CREATE UNIQUE INDEX IF NOT EXISTS uq_ontology_daily_briefs_user_date_processing
  ON ontology_daily_briefs (user_id, brief_date)
  WHERE generation_status = 'processing';

-- Fast "latest snapshot for date" access
CREATE INDEX IF NOT EXISTS idx_ontology_daily_briefs_user_date_created_desc
  ON ontology_daily_briefs (user_id, brief_date, created_at DESC);
