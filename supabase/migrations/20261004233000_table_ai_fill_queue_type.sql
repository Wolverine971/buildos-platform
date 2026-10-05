-- supabase/migrations/20261004233000_table_ai_fill_queue_type.sql
-- Tables: AI question columns (docs/specs/tables/CONTRACT.md, "AI question columns").
--
-- A column with `ai: {prompt, research}` is a question asked of every row. "Fill" marks the
-- chosen cells `pending` (onto_document_table_apply, from 20261004230000) and queues one
-- `table_ai_fill` job through the existing add_queue_job RPC
-- (packages/shared-agent-ops/src/tables/table-ai-fill.ts). The worker
-- (apps/worker/src/workers/tables/tableAiFillWorker.ts) answers each row and writes the cell
-- with provenance in cell_meta.
--
-- Only the queue type is new. add_queue_job stays service-role only (web callers enqueue with
-- the admin client after RLS has accepted the pending marks), and its dedup slot
-- `table_ai_fill:<document_id>:<column_id>` keeps one active run per column. Until a worker
-- that knows the job type is deployed, jobs wait in the queue (claims filter by job type).
--
-- Rollback: nothing to drop; enum values cannot be removed. Jobs of this type simply stop
-- being claimed once no worker registers the processor.

DO $$ BEGIN
	ALTER TYPE public.queue_type ADD VALUE IF NOT EXISTS 'table_ai_fill';
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
