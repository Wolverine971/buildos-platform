-- supabase/migrations/20260811230000_agentic_chat_effect_scope_trigger_null_guard.sql
-- Legacy SSE tool telemetry has no mutation-effect link. Skip the protected
-- effect-ledger lookup entirely for those rows so an authenticated UPSERT can
-- reconcile an incremental mutation row with its end-of-turn payload.
--
-- Keep the validation function security-invoker and keep chat_turn_effects
-- service-only. Effect-linked worker rows still execute the existing scope
-- check whenever effect_id or turn_run_id is inserted or updated.

BEGIN;

DROP TRIGGER trg_chat_tool_executions_effect_scope
	ON public.chat_tool_executions;

CREATE TRIGGER trg_chat_tool_executions_effect_scope
BEFORE INSERT OR UPDATE OF effect_id, turn_run_id
	ON public.chat_tool_executions
FOR EACH ROW
WHEN (NEW.effect_id IS NOT NULL)
EXECUTE FUNCTION public.validate_agentic_chat_tool_effect_scope();

COMMENT ON TRIGGER trg_chat_tool_executions_effect_scope
	ON public.chat_tool_executions IS
	'Validates turn scope only for effect-linked worker telemetry; null-effect legacy telemetry bypasses the service-only effect ledger.';

COMMIT;
