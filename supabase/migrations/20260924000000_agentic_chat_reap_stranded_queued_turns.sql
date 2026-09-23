-- supabase/migrations/20260924000000_agentic_chat_reap_stranded_queued_turns.sql
-- Agentic Chat: time out worker turns that no worker ever picked up.
--
-- Queue-first admission (20260825161846) replaced the five-minute queue
-- residence cutoff with the seven-day input-artifact retention, and admission
-- no longer rejects on worker pressure. With the chat worker down, a turn sat in
-- 'queued' indefinitely ("Thinking..." forever) and a returning worker executed
-- it late, including calendar and task writes.
--
-- This sweeper finalizes every worker turn still queued ten minutes after
-- admission through the existing atomic queued-cancel path,
-- request_agentic_chat_turn_cancel(reason 'timeout', source 'sweeper'). That is
-- the same transaction a browser Stop on a queued turn runs: the turn becomes
-- terminal 'cancelled' with finished_reason/cancel_reason 'timeout', its queue
-- job becomes 'cancelled' (never claimable again), and the stream receives the
-- deterministic done event (payload cancel_source 'sweeper'). Web renders that
-- terminal as a "couldn't start" failure, not as a user Stop.
--
-- Eligibility and locking:
--   * turn status 'queued', execution_mode 'worker_realtime', admitted
--     (created_at) at least p_queued_before_seconds ago (floor 300, default 600);
--   * its agentic_chat_turn queue job is unclaimed: status pending/retrying and
--     no processing token. A job a worker has claimed ('processing') is never
--     touched, even while its turn is still 'queued'.
--   * turn and job rows are locked together with FOR UPDATE SKIP LOCKED, so a
--     worker claiming concurrently always wins cleanly and the sweeper never
--     waits on a worker lock.
--
-- A requeued pre-start turn (recover_agentic_chat_turn put it back to 'queued'
-- with a backoff) is also eligible: it never reached the provider, and the user
-- has been waiting since admission.
--
-- SECURITY INVOKER (matching the worker control RPCs, not the legacy reaper's
-- DEFINER): request_agentic_chat_turn_cancel and finalize_agentic_chat_turn
-- require the caller to be service_role, which a definer-owned body would not be.
-- The legacy reaper (reap_stale_legacy_agentic_chat_turns) is left in place so
-- a web build that still calls it keeps working until the cron deploy lands.
--
-- Reconciliation fix: a turn cancelled while still queued stays at execution
-- generation 0 (terminal event '<turn>:0:1'), but reconcile_agentic_chat_turn
-- rejected every non-queued generation-0 turn as relationship_corrupt. Nothing
-- broadcasts a sweeper (or queued browser) cancel, so the browser learns it only
-- by reconciling; without this patch it retried forever and never showed the
-- terminal. Only 'cancelled' is admitted at generation 0: finalize allows no
-- other terminal from 'queued'.

BEGIN;

DO $migration$
DECLARE
	v_definition text;
	v_patched text;
	v_needle text :=
		'OR (v_turn.status <> ''queued'' AND v_turn.execution_generation < 1) THEN';
	v_replacement text :=
		'OR (v_turn.status NOT IN (''queued'', ''cancelled'') AND v_turn.execution_generation < 1) THEN';
BEGIN
	SELECT pg_get_functiondef(procedures.oid)
	INTO STRICT v_definition
	FROM pg_catalog.pg_proc procedures
	WHERE procedures.oid =
		'public.reconcile_agentic_chat_turn(uuid,uuid,integer,integer)'::regprocedure;

	IF position(v_replacement IN v_definition) > 0 THEN
		-- Already patched (re-run or out-of-band apply): nothing to do.
		RETURN;
	END IF;
	IF position(v_needle IN v_definition) = 0
		OR position(v_needle IN substr(
			v_definition,
			position(v_needle IN v_definition) + length(v_needle)
		)) > 0 THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_queued_cancel_preflight_failed';
	END IF;
	v_patched := replace(v_definition, v_needle, v_replacement);
	IF v_patched = v_definition OR position(v_replacement IN v_patched) = 0 THEN
		RAISE EXCEPTION 'agentic_chat_reconcile_queued_cancel_patch_failed';
	END IF;
	EXECUTE v_patched;
END;
$migration$;

COMMENT ON FUNCTION public.reconcile_agentic_chat_turn(uuid, uuid, integer, integer) IS
	'Service-only, ownership-scoped current-generation Agentic Chat snapshot. Locks the turn before reading complete stream projection, retained post-projection events, and terminal message. Generation 0 is valid while queued and after a queued cancel.';

CREATE OR REPLACE FUNCTION public.reap_stranded_queued_agentic_chat_turns(
	p_queued_before_seconds integer DEFAULT 600,
	p_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_queued_before_seconds integer := GREATEST(COALESCE(p_queued_before_seconds, 600), 300);
	v_batch_size integer := GREATEST(LEAST(COALESCE(p_batch_size, 100), 500), 1);
	v_cutoff timestamptz;
	v_turn_ids uuid[];
	v_user_ids uuid[];
	v_candidate_count integer;
	v_reaped_count integer := 0;
	v_failed_count integer := 0;
	v_receipt jsonb;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_queued_reaper_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	v_cutoff := clock_timestamp() - make_interval(secs => v_queued_before_seconds);

	-- Turn -> queue lock order, never waiting: a row a worker (or another
	-- sweeper) holds is skipped, and the worker's claim proceeds untouched.
	SELECT
		COALESCE(array_agg(candidates.id ORDER BY candidates.created_at, candidates.id), '{}'),
		COALESCE(array_agg(candidates.user_id ORDER BY candidates.created_at, candidates.id), '{}')
	INTO v_turn_ids, v_user_ids
	FROM (
		SELECT turns.id, turns.user_id, turns.created_at
		FROM public.chat_turn_runs turns
		JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
		WHERE turns.status = 'queued'
			AND turns.execution_mode = 'worker_realtime'
			AND turns.created_at <= v_cutoff
			AND jobs.job_type = 'agentic_chat_turn'
			AND jobs.status IN ('pending', 'retrying')
			AND jobs.processing_token IS NULL
		ORDER BY turns.created_at, turns.id
		LIMIT v_batch_size
		FOR UPDATE OF turns, jobs SKIP LOCKED
	) candidates;

	v_candidate_count := COALESCE(array_length(v_turn_ids, 1), 0);

	FOR v_index IN 1 .. v_candidate_count LOOP
		-- One malformed turn must not abort the batch or wedge the cron; it is
		-- counted, logged, and retried on the next sweep.
		BEGIN
			v_receipt := public.request_agentic_chat_turn_cancel(
				v_turn_ids[v_index],
				v_user_ids[v_index],
				'timeout',
				'sweeper'
			);
			IF v_receipt->>'outcome' = 'cancelled' THEN
				v_reaped_count := v_reaped_count + 1;
			END IF;
		EXCEPTION
			WHEN OTHERS THEN
				v_failed_count := v_failed_count + 1;
				RAISE WARNING 'agentic_chat_queued_reaper_turn_failed turn=% sqlstate=% message=%',
					v_turn_ids[v_index], SQLSTATE, SQLERRM;
		END;
	END LOOP;

	RETURN jsonb_build_object(
		'reaped_count', v_reaped_count,
		'failed_count', v_failed_count,
		'has_more', v_candidate_count = v_batch_size,
		'queued_before_seconds', v_queued_before_seconds,
		'batch_size', v_batch_size
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.reap_stranded_queued_agentic_chat_turns(integer, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reap_stranded_queued_agentic_chat_turns(integer, integer)
	TO service_role;

COMMENT ON FUNCTION public.reap_stranded_queued_agentic_chat_turns(integer, integer) IS
	'Service-only bounded SKIP LOCKED sweeper: worker turns still queued (job unclaimed) at least 300s (default 600s) after admission are finalized through request_agentic_chat_turn_cancel(timeout, sweeper).';

COMMIT;
