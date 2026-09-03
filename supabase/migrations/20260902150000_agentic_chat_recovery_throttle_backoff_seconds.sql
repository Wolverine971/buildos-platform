-- supabase/migrations/20260902150000_agentic_chat_recovery_throttle_backoff_seconds.sql
-- Seconds-scale pre-start retry backoff for provider throttle and pre-start
-- timeouts (turn-executor audit 2026-09-02, Finding 14 / lane E F6).
--
-- DEPLOY ORDER: apply this migration to production BEFORE the app deploy that
-- ships the audit's Finding 12/14 executor changes, so a throttled turn is
-- never parked on the old minutes-scale schedule by a worker already running
-- the new budget-aware code.
--
-- recover_agentic_chat_turn requeues only typed safe pre-start failures
-- (transient_infra, provider_throttle, timeout_pre_start). Every class shared
-- one backoff: LEAST(2^attempts, 16) minutes plus up to 60 seconds of jitter.
-- A provider-capacity blip (provider_capacity_unavailable -> provider_throttle)
-- therefore parked the user for 60-120 seconds before the first retry even
-- though nothing had started. Throttle and pre-start timeout now use
-- LEAST(5 * 2^attempts, 60) seconds plus up to 5 seconds of jitter
-- (5s, 10s, 20s ...), while transient_infra keeps the minutes-scale schedule
-- for genuine infrastructure trouble.
--
-- The function body is patched in place from pg_get_functiondef, the same way
-- 20260825161846 patched its queue-residence guard, so no later edit to the
-- function is silently reverted by a stale full-body CREATE OR REPLACE.

DO $migration$
DECLARE
	v_definition text;
	v_patched text;
	v_needle text := E'\t\t\tscheduled_for = v_now\n'
		|| E'\t\t\t\t+ (LEAST(POWER(2, v_current_attempts), 16) || '' minutes'')::interval\n'
		|| E'\t\t\t\t+ (random() * interval ''60 seconds''),';
	v_replacement text := E'\t\t\tscheduled_for = v_now\n'
		|| E'\t\t\t\t+ CASE\n'
		|| E'\t\t\t\t\tWHEN v_failure_class IN (''provider_throttle'', ''timeout_pre_start'') THEN\n'
		|| E'\t\t\t\t\t\t(LEAST(5 * POWER(2, v_current_attempts), 60) || '' seconds'')::interval\n'
		|| E'\t\t\t\t\t\t+ (random() * interval ''5 seconds'')\n'
		|| E'\t\t\t\t\tELSE\n'
		|| E'\t\t\t\t\t\t(LEAST(POWER(2, v_current_attempts), 16) || '' minutes'')::interval\n'
		|| E'\t\t\t\t\t\t+ (random() * interval ''60 seconds'')\n'
		|| E'\t\t\t\tEND,';
BEGIN
	SELECT pg_get_functiondef(procedures.oid)
	INTO STRICT v_definition
	FROM pg_catalog.pg_proc procedures
	JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = procedures.pronamespace
	WHERE namespaces.nspname = 'public'
		AND procedures.proname = 'recover_agentic_chat_turn'
		AND procedures.pronargs = 6;

	IF position(v_replacement IN v_definition) > 0 THEN
		RAISE NOTICE 'agentic_chat_recovery_throttle_backoff_seconds already applied';
		RETURN;
	END IF;
	IF position(v_needle IN v_definition) = 0 THEN
		RAISE EXCEPTION 'agentic_chat_recovery_throttle_backoff_preflight_failed';
	END IF;
	v_patched := replace(v_definition, v_needle, v_replacement);
	IF v_patched = v_definition OR position(v_replacement IN v_patched) = 0 THEN
		RAISE EXCEPTION 'agentic_chat_recovery_throttle_backoff_patch_failed';
	END IF;
	EXECUTE v_patched;
END;
$migration$;

COMMENT ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text) IS
	'Service-only recovery classifier. Safe pre-start retries are bounded by attempts and frozen artifact retention; provider_throttle and timeout_pre_start back off in seconds (LEAST(5 * 2^attempts, 60) + <=5s jitter), transient_infra in minutes.';

-- Rollback: re-run the DO block above with v_needle and v_replacement swapped,
-- then restore the 20260825161846 function comment.
