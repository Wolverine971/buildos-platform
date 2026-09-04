-- artifacts/agentic-chat-sql-drop-migration-DRAFT-2026-09-04.sql
-- DRAFT — apply only after 72h at zero legacy_sse rows post-merge; move under
-- supabase/migrations with a fresh timestamp then.
--
-- Evidence: docs/technical/reviews/AGENTIC_CHAT_SQL_FUNCTION_AUDIT_2026-09-04.md
-- Scope: the LEGACY-ONLY and DEAD functions from that audit, the B8 index, and the
-- chat_turn_runs.execution_mode default. Ordered callers-before-callees; nothing in this
-- set is called by anything else in this set.
--
-- PRECONDITION (application side, must already be merged and deployed):
--   * the legacy web engine is deleted (stage S8): apps/web/src/lib/services/agentic-chat/
--     legacy-execution/**, agentic-chat-v2/stream-orchestrator/**, stream-route/,
--     routes/api/agent/v2/stream/**, and admitLegacyAgenticChatTurn in
--     agentic-chat-v2/turn-admission.ts
--   * apps/web/src/routes/api/cron/agentic-chat-stale-turns/ is deleted and its cron entry
--     is removed from apps/web/vercel.json
--
-- PRECONDITION (data side, verify before running):
--   SELECT count(*) FROM public.chat_turn_runs WHERE execution_mode = 'legacy_sse'
--     AND created_at > now() - interval '72 hours';   -- must be 0
--   SELECT count(*) FROM public.chat_turn_runs WHERE execution_mode = 'legacy_sse'
--     AND status = 'running';                          -- must be 0

BEGIN;

-- Fail closed if a legacy turn was admitted inside the bake window.
DO $guard$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_runs turns
		WHERE turns.execution_mode = 'legacy_sse'
			AND turns.created_at > now() - interval '72 hours'
	) THEN
		RAISE EXCEPTION 'agentic_chat_legacy_bake_not_clean';
	END IF;
END;
$guard$;

-- 1. Index read only by reap_stale_legacy_agentic_chat_turns.
--    supabase/migrations/20260830155952_agentic_chat_stale_legacy_turn_reaper.sql:11
DROP INDEX IF EXISTS public.idx_chat_turn_runs_legacy_running_progress;

-- 2. LEGACY-ONLY: cron reaper for stale legacy_sse turns.
--    supabase/migrations/20260830155952_agentic_chat_stale_legacy_turn_reaper.sql:19
--    Only caller was apps/web/src/routes/api/cron/agentic-chat-stale-turns/+server.ts:94.
DROP FUNCTION IF EXISTS public.reap_stale_legacy_agentic_chat_turns(integer, integer);

-- 3. LEGACY-ONLY: 21-argument legacy admission transaction.
--    Created supabase/migrations/20260731150000_agentic_chat_legacy_atomic_admission.sql:62,
--    body patched in place by 20260830010000_agentic_chat_track_i_hardening.sql:115 (signature
--    unchanged). Only caller was legacy-execution/http-stream/handler.server.ts:1024 via
--    agentic-chat-v2/turn-admission.ts:317.
DROP FUNCTION IF EXISTS public.admit_legacy_agentic_chat_turn(
	uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text,
	boolean, text, timestamptz, text, jsonb, integer, integer, integer, integer
);

-- 4. DEAD: trigger function whose binding trg_chat_turn_runs_terminal_pending_intent was
--    dropped by 20260814010000_agentic_chat_terminal_pending_contract_metadata.sql:401 and
--    never recreated. Its helper agentic_chat_expected_write_tool_names_v1(jsonb) stays —
--    validate_agentic_chat_turn_intent_snapshot_v1() still calls it.
DROP FUNCTION IF EXISTS public.apply_agentic_chat_terminal_pending_intent_v1();

-- 5. DEAD: no caller in any app, trigger, default, or SQL body. Drops its
--    GRANT EXECUTE ... TO authenticated with it
--    (supabase/migrations/20260102_increment_chat_session_metrics.sql:23).
DROP FUNCTION IF EXISTS public.increment_chat_session_metrics(uuid, integer, integer, integer);

-- 6. New turns are worker_realtime only. Historical legacy_sse rows stay readable, so
--    chk_chat_turn_runs_execution_mode is deliberately NOT tightened to a single value.
ALTER TABLE public.chat_turn_runs
	ALTER COLUMN execution_mode SET DEFAULT 'worker_realtime';

COMMENT ON COLUMN public.chat_turn_runs.execution_mode IS
	'Execution lane for the turn. Defaults to worker_realtime; the legacy_sse lane was removed '
	'with the legacy web engine. Historical legacy_sse rows are retained, so '
	'chk_chat_turn_runs_execution_mode still permits both values and is deliberately not '
	'tightened.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- -----------------------------------------------------------------------------
-- OPTIONAL, NOT PART OF B8 — do not include without deleting its tests in the same change.
--
-- TEST-ONLY: persist_agentic_chat_supervisor_question_checkpoint has no production caller.
-- The legacy supervisor wrote chat_turn_checkpoints directly via createTurnCheckpoint
-- (agentic-chat-v2/turn-supervisor/checkpoint-service.server.ts:104), never through this RPC.
-- Dropping it breaks:
--   supabase/tests/20260813010000_agentic_chat_supervisor_question_checkpoint.test.sql
--   apps/web/src/lib/services/agentic-chat-v2/p4-supervisor-question-checkpoint.postgres.test.ts
--   apps/web/src/lib/services/agentic-chat-v2/p4-checkpoint-resume-lifecycle.postgres.test.ts
--
-- DROP FUNCTION IF EXISTS public.persist_agentic_chat_supervisor_question_checkpoint(
-- 	uuid, uuid, uuid, uuid, integer, uuid, uuid, integer, text, text, jsonb, jsonb, jsonb
-- );
