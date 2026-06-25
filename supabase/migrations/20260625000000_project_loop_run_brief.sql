-- supabase/migrations/20260625000000_project_loop_run_brief.sql
-- Persist a compact Project Review brief on each loop run.

ALTER TABLE IF EXISTS project_loop_runs
  ADD COLUMN IF NOT EXISTS brief jsonb;
