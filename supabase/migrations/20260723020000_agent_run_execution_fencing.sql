-- supabase/migrations/20260723020000_agent_run_execution_fencing.sql
-- 2026-07-23 queue audit P1: domain execution fencing for Agent Runs.
--
-- The queue's processing_token fences queue_jobs rows only. The agent_runs
-- domain row had NO executor ownership: a queue retry deliberately attaches to
-- a status='running' run (isAgentRunQueueRetryResume) while the previous
-- executor may still be alive (Promise.race timeouts never cancelled it), and
-- finalize/pause updated by run id alone — so a zombie executor could overwrite
-- a terminal status written by the retry or the stranded sweep.
--
-- execution_generation is a monotonic fencing token: every executor claim
-- increments it via compare-and-swap, and every critical status transition is
-- predicated on the claimer's generation. A stale executor's update matches
-- zero rows instead of corrupting state.

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS execution_generation integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN agent_runs.execution_generation IS
  'Executor fencing token. Incremented (CAS) on every worker claim; finalize/pause/checkpoint updates are predicated on the claiming generation so stale executors cannot overwrite newer state. (2026-07-23 queue audit)';
