-- supabase/migrations/20260924000100_agentic_chat_turn_leases.sql
-- Agentic Chat: per-turn worker leases, dead-worker recovery in ~90 s, and a
-- Stop that works when no worker is alive.
-- Design: docs/architecture/AGENTIC_CHAT_TURN_LEASES_2026-09-23.md
--
-- Requires 20260924000000_agentic_chat_reap_stranded_queued_turns.sql first
-- (same deploy). Backward compatible with pre-lease workers: a running turn
-- whose generation never renewed a lease keeps the old 420 s rule, which the
-- 360 s worker hard cap protects.
--
-- 1. chat_turn_runs.worker_lease_generation / worker_lease_renewed_at: the
--    lease a worker renews every 15 s. It belongs to one execution generation.
--    chat_turn_recovery_failures: the ledger that backs off poison turns.
-- 2. agentic_chat_turn_lease_state_v1: the ONE place every threshold lives.
--    held | stale | expired | abandoned. Renewal, recovery (worker sweep and
--    web cron), Stop, and the finalize guard all read it.
-- 3. renew_agentic_chat_turn_lease: renews only while the turn is running at
--    that generation, its queue row is processing with that token, and the
--    lease has not expired. Returns renewed | lost; never throws for ownership.
-- 4. resolve_agentic_chat_effects_on_terminal_v1 (trigger): every terminal
--    transition closes dangling effects: reserved -> cancelled (never started),
--    started -> uncertain (may have happened).
-- 5. recover_agentic_chat_turn (patched in place): in-flight effects no longer
--    park a turn in effect_reconciliation_required forever. A turn with a
--    started or uncertain effect finalizes failed / uncertain_external_commit.
-- 6. agentic_chat_recover_dead_turn_v1 / agentic_chat_finalize_dead_turn_v1:
--    one turn's recovery under its row lock (requeue if the model never
--    started, else finalize with partial text kept; a running turn whose queue
--    row no worker holds is finalized too; workflow turns go through
--    recover_agentic_chat_workflow_turn_v1 first). The finalize re-proves the
--    turn is dead, so no caller can end a live one.
-- 7. recover_dead_agentic_chat_turns: bounded batch, one turn locked at a time
--    (SKIP LOCKED, 2 s lock timeout). Turns whose recovery raises back off,
--    sort last, end bare after 3 failures, and park (reported) after 8. The
--    chat worker calls it every 15 s (p_workflow_handoff => true); the
--    per-minute web cron without handoff, so recovery runs with the worker down.
-- 8. request_agentic_chat_turn_cancel (patched in place): Stop on a running
--    turn whose lease is stale (>= 45 s) finalizes it as cancelled at once;
--    otherwise it signals the live worker exactly as before. A workflow turn
--    is left for a worker's handoff (or the cron once abandoned).
-- 9. reap_stranded_queued_agentic_chat_turns (patched in place): a turn is
--    timed from entering its current queued state, so a requeue gets its retry.
--
-- The fence: every worker write RPC already requires turn status running,
-- the current generation, and the queue row's processing token. Recovery
-- either requeues (clears the token; the next claim bumps the generation),
-- finalizes (terminal), or rotates the token for a workflow handoff, all
-- under the turn lock, so a slow-but-alive worker's later writes are rejected.
--
-- Patches are applied from pg_get_functiondef (the house convention, see
-- 20260902150000) so no later edit is reverted by a stale full body. Each
-- patch is idempotent and fails closed if its needle is missing or repeated.
-- ROLLBACK (after rolling back code, only if needed): drop the trigger, the
-- six new functions, and chat_turn_recovery_failures; re-run each patch with
-- needle and replacement swapped. The two columns can stay; nothing else
-- reads them.

BEGIN;

-- Every DDL below takes a short table lock on chat_turn_runs / queue_jobs.
-- Fail the deploy fast rather than queue behind a long transaction and block
-- chat traffic behind the migration.
SET LOCAL lock_timeout = '5s';

-- An unapplied draft of this migration defined these with fewer arguments;
-- drop them so the calls below cannot become ambiguous.
DROP FUNCTION IF EXISTS public.agentic_chat_recover_dead_turn_v1(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.agentic_chat_finalize_dead_turn_v1(uuid, text, text, text);

-- ---------------------------------------------------------------------------
-- 1. Lease columns and the recovery-failure ledger
-- ---------------------------------------------------------------------------

ALTER TABLE public.chat_turn_runs
	ADD COLUMN IF NOT EXISTS worker_lease_generation integer,
	ADD COLUMN IF NOT EXISTS worker_lease_renewed_at timestamptz;

DO $migration$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_catalog.pg_constraint constraints
		WHERE constraints.conrelid = 'public.chat_turn_runs'::regclass
			AND constraints.conname = 'chk_chat_turn_runs_worker_lease'
	) THEN
		-- NOT VALID: every existing row is NULL/NULL, so skipping the full scan
		-- under the table lock changes nothing; new writes are still checked.
		ALTER TABLE public.chat_turn_runs
			ADD CONSTRAINT chk_chat_turn_runs_worker_lease CHECK (
				(worker_lease_generation IS NULL AND worker_lease_renewed_at IS NULL)
				OR (worker_lease_generation >= 1 AND worker_lease_renewed_at IS NOT NULL)
			) NOT VALID;
	END IF;
END;
$migration$;

COMMENT ON COLUMN public.chat_turn_runs.worker_lease_generation IS
	'Execution generation whose worker last renewed its lease. A lease counts only while this equals execution_generation.';
COMMENT ON COLUMN public.chat_turn_runs.worker_lease_renewed_at IS
	'Database time of the last lease renewal (every 15 s). Read only through agentic_chat_turn_lease_state_v1.';

-- Turns whose dead-turn recovery raised. Kept off chat_turn_runs on purpose:
-- this table has no triggers, so recording a failure can never itself fail.
CREATE TABLE IF NOT EXISTS public.chat_turn_recovery_failures (
	turn_run_id uuid PRIMARY KEY REFERENCES public.chat_turn_runs (id) ON DELETE CASCADE,
	failure_count integer NOT NULL CHECK (failure_count >= 1),
	first_failed_at timestamptz NOT NULL,
	last_failed_at timestamptz NOT NULL,
	last_sqlstate text,
	last_error text CHECK (last_error IS NULL OR length(last_error) <= 500)
);
ALTER TABLE public.chat_turn_recovery_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_turn_recovery_failures FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_turn_recovery_failures TO service_role;
COMMENT ON TABLE public.chat_turn_recovery_failures IS
	'Service-only: dead-turn recoveries that raised. Backs a failing turn off (sorted last), ends it bare after 3 failures, parks it (reported every sweep) after 8; cleared when recovery succeeds.';

-- ---------------------------------------------------------------------------
-- 2. The single threshold policy
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agentic_chat_turn_lease_state_v1(
	p_turn_status text,
	p_execution_generation integer,
	p_lease_generation integer,
	p_lease_renewed_at timestamptz,
	p_queue_heartbeat_at timestamptz,
	p_now timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	-- Mirrored in packages/shared-types AGENTIC_CHAT_TURN_LEASE_POLICY_V1; a
	-- worker unit test fails if these drift. The worker renews every 15 s and
	-- self-fences 60 s after its last acknowledged renewal.
	c_lease_stale_after CONSTANT interval := interval '45 seconds';
	c_lease_expired_after CONSTANT interval := interval '90 seconds';
	c_unleased_expired_after CONSTANT interval := interval '420 seconds';
	v_leased boolean;
	v_expired_after interval;
	v_silence interval;
BEGIN
	-- A running turn is leased once its current generation has renewed. Before
	-- that (a pre-lease worker, or the instant between claim and first renewal)
	-- the queue row heartbeat is the only evidence, under the old 420 s rule.
	-- Anything else has nothing running and gets 90 s of silence on the given
	-- timestamp: a queued turn whose queue row a worker claimed, a terminal turn
	-- whose queue row was never released, or (status passed as 'orphaned') a
	-- running turn whose queue row no worker holds, timed from its last sign
	-- of life.
	v_leased := p_turn_status = 'running'
		AND p_lease_generation IS NOT NULL
		AND p_lease_generation = p_execution_generation
		AND p_lease_renewed_at IS NOT NULL;
	v_expired_after := CASE
		WHEN p_turn_status = 'running' AND NOT v_leased THEN c_unleased_expired_after
		ELSE c_lease_expired_after
	END;
	v_silence := p_now - CASE WHEN v_leased THEN p_lease_renewed_at ELSE p_queue_heartbeat_at END;

	IF v_silence IS NULL THEN
		RETURN 'held';
	END IF;
	-- Expired for a whole further period with nobody taking over.
	IF v_silence >= 2 * v_expired_after THEN
		RETURN 'abandoned';
	END IF;
	IF v_silence >= v_expired_after THEN
		RETURN 'expired';
	END IF;
	-- Only a leased turn can be stale: an unleased heartbeat ticks every 60 s.
	IF v_leased AND v_silence >= c_lease_stale_after THEN
		RETURN 'stale';
	END IF;
	RETURN 'held';
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Lease renewal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.renew_agentic_chat_turn_lease(
	p_turn_run_id uuid,
	p_queue_job_id uuid,
	p_processing_token uuid,
	p_execution_generation integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_now timestamptz;
	v_state text;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);

	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_lease_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL
		OR p_queue_job_id IS NULL
		OR p_processing_token IS NULL
		OR p_execution_generation IS NULL
		OR p_execution_generation < 1 THEN
		RAISE EXCEPTION 'agentic_chat_lease_invalid_request';
	END IF;

	-- Turn -> queue, the lock order of every worker primitive, so renewal and
	-- recovery are totally ordered.
	SELECT turns.*
	INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_turn.execution_mode <> 'worker_realtime'
		OR v_turn.queue_job_id IS DISTINCT FROM p_queue_job_id THEN
		RETURN jsonb_build_object(
			'outcome', 'lost',
			'reason', 'relationship_mismatch',
			'turn_run_id', p_turn_run_id,
			'execution_generation', p_execution_generation
		);
	END IF;
	IF v_turn.status <> 'running' OR v_turn.execution_generation <> p_execution_generation THEN
		RETURN jsonb_build_object(
			'outcome', 'lost',
			'reason', CASE
				WHEN v_turn.status IN ('completed', 'failed', 'cancelled') THEN 'turn_terminal'
				WHEN v_turn.execution_generation <> p_execution_generation THEN 'generation_changed'
				ELSE 'not_running'
			END,
			'turn_run_id', v_turn.id,
			'execution_generation', p_execution_generation
		);
	END IF;

	SELECT jobs.*
	INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = p_queue_job_id
	FOR UPDATE;

	IF NOT FOUND
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.status::text <> 'processing'
		OR v_job.processing_token IS DISTINCT FROM p_processing_token THEN
		RETURN jsonb_build_object(
			'outcome', 'lost',
			'reason', 'ownership_lost',
			'turn_run_id', v_turn.id,
			'execution_generation', p_execution_generation
		);
	END IF;

	v_now := clock_timestamp();
	v_state := public.agentic_chat_turn_lease_state_v1(
		v_turn.status,
		v_turn.execution_generation,
		v_turn.worker_lease_generation,
		v_turn.worker_lease_renewed_at,
		v_job.updated_at,
		v_now
	);
	-- An expired lease is never revived: recovery may already have decided to
	-- take the turn over, and the worker promised to stop by now.
	IF v_state IN ('expired', 'abandoned') THEN
		RETURN jsonb_build_object(
			'outcome', 'lost',
			'reason', 'lease_expired',
			'turn_run_id', v_turn.id,
			'execution_generation', p_execution_generation
		);
	END IF;

	UPDATE public.chat_turn_runs turns
	SET worker_lease_generation = p_execution_generation,
		worker_lease_renewed_at = v_now
	WHERE turns.id = v_turn.id
		AND turns.status = 'running'
		AND turns.execution_generation = p_execution_generation;

	RETURN jsonb_build_object(
		'outcome', 'renewed',
		'turn_run_id', v_turn.id,
		'execution_generation', p_execution_generation,
		'renewed_at', v_now
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Terminal turns close their dangling effects
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_agentic_chat_effects_on_terminal_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_now timestamptz := clock_timestamp();
BEGIN
	IF NEW.execution_mode <> 'worker_realtime'
		OR NEW.status NOT IN ('completed', 'failed', 'cancelled') THEN
		RETURN NEW;
	END IF;

	-- Never started: nothing reached the outside world.
	UPDATE public.chat_turn_effects effects
	SET state = 'cancelled',
		finished_at = v_now,
		failure_code = COALESCE(effects.failure_code, 'turn_ended_before_start')
	WHERE effects.turn_run_id = NEW.id
		AND effects.state = 'reserved';

	-- Started and never settled: it may have happened. Uncertain rows keep the
	-- never-deleted audit retention and can still be reconciled by effect id.
	UPDATE public.chat_turn_effects effects
	SET state = 'uncertain',
		finished_at = v_now,
		failure_code = COALESCE(effects.failure_code, 'turn_ended_while_in_flight')
	WHERE effects.turn_run_id = NEW.id
		AND effects.state = 'started';

	RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_chat_turn_runs_resolve_effects_on_terminal ON public.chat_turn_runs;
CREATE TRIGGER trg_chat_turn_runs_resolve_effects_on_terminal
AFTER UPDATE OF status ON public.chat_turn_runs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.resolve_agentic_chat_effects_on_terminal_v1();

-- ---------------------------------------------------------------------------
-- 5. recover_agentic_chat_turn: in-flight effects finalize instead of parking
-- ---------------------------------------------------------------------------

DO $migration$
DECLARE
	v_signature regprocedure :=
		'public.recover_agentic_chat_turn(uuid,uuid,uuid,integer,text,text)'::regprocedure;
	v_definition text;
	v_patched text;
	v_needles text[] := ARRAY[
		E'\tIF v_blocking_effect_count > 0 THEN\n'
		|| E'\t\tRETURN jsonb_build_object(\n'
		|| E'\t\t\t''outcome'', ''effect_reconciliation_required'',\n'
		|| E'\t\t\t''execution_may_retry'', false,\n'
		|| E'\t\t\t''failure_code'', v_failure_class,\n'
		|| E'\t\t\t''turn_run_id'', v_turn.id,\n'
		|| E'\t\t\t''queue_job_id'', v_turn.queue_job_id,\n'
		|| E'\t\t\t''session_id'', v_turn.session_id,\n'
		|| E'\t\t\t''user_id'', v_turn.user_id,\n'
		|| E'\t\t\t''correlation_id'', v_turn.correlation_id,\n'
		|| E'\t\t\t''execution_generation'', v_turn.execution_generation,\n'
		|| E'\t\t\t''status'', v_turn.status,\n'
		|| E'\t\t\t''blocking_effect_count'', v_blocking_effect_count\n'
		|| E'\t\t);\n'
		|| E'\tEND IF;\n',
		E'\tv_failure_class := CASE\n'
		|| E'\t\tWHEN v_queue_residence_expired THEN ''stale_context''\n'
		|| E'\t\tELSE v_failure_class\n'
		|| E'\tEND;\n'
	];
	v_replacements text[] := ARRAY[
		E'\t-- 20260924000100 (turn leases): an unsettled effect no longer parks the\n'
		|| E'\t-- turn. Effects never allow a replay (v_safe_pre_start needs zero rows);\n'
		|| E'\t-- the terminal trigger closes reserved/started rows, and a started or\n'
		|| E'\t-- uncertain one makes the terminal failure uncertain_external_commit.\n'
		|| E'\tIF v_blocking_effect_count > 0 AND EXISTS (\n'
		|| E'\t\tSELECT 1\n'
		|| E'\t\tFROM public.chat_turn_effects effects\n'
		|| E'\t\tWHERE effects.turn_run_id = v_turn.id\n'
		|| E'\t\t\tAND effects.state IN (''started'', ''uncertain'')\n'
		|| E'\t) THEN\n'
		|| E'\t\tv_failure_class := ''uncertain_external_commit'';\n'
		|| E'\tEND IF;\n',
		E'\tv_failure_class := CASE\n'
		|| E'\t\tWHEN v_failure_class = ''uncertain_external_commit'' THEN v_failure_class\n'
		|| E'\t\tWHEN v_queue_residence_expired THEN ''stale_context''\n'
		|| E'\t\tELSE v_failure_class\n'
		|| E'\tEND;\n'
	];
	v_index integer;
	v_after text;
BEGIN
	SELECT pg_get_functiondef(v_signature) INTO STRICT v_definition;
	v_patched := v_definition;
	FOR v_index IN 1 .. array_length(v_needles, 1) LOOP
		IF position(v_replacements[v_index] IN v_patched) > 0 THEN
			CONTINUE;
		END IF;
		v_after := substr(
			v_patched,
			position(v_needles[v_index] IN v_patched) + length(v_needles[v_index])
		);
		IF position(v_needles[v_index] IN v_patched) = 0
			OR position(v_needles[v_index] IN v_after) > 0 THEN
			RAISE EXCEPTION 'agentic_chat_turn_leases_recover_preflight_failed:%', v_index;
		END IF;
		v_patched := replace(v_patched, v_needles[v_index], v_replacements[v_index]);
	END LOOP;
	IF v_patched <> v_definition THEN
		EXECUTE v_patched;
	END IF;
END;
$migration$;

COMMENT ON FUNCTION public.recover_agentic_chat_turn(uuid, uuid, uuid, integer, text, text) IS
	'Service-only recovery classifier. Safe pre-start retries are bounded by attempts and frozen artifact retention; provider_throttle and timeout_pre_start back off in seconds, transient_infra in minutes. Unsettled effects never retry and finalize failed as uncertain_external_commit (started/uncertain) instead of parking the turn.';

-- ---------------------------------------------------------------------------
-- 6. One dead turn, under its row lock
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agentic_chat_finalize_dead_turn_v1(
	p_turn_run_id uuid,
	p_status text,
	p_failure_code text,
	p_trigger text,
	p_bare boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_stream public.chat_turn_stream_state%ROWTYPE;
	v_now timestamptz;
	v_orphaned boolean;
	v_silent_since timestamptz;
	v_state text;
	v_token uuid;
	v_text text := '';
	v_projection jsonb := '{}'::jsonb;
	v_uncertain_count integer;
	v_failure_code text;
	v_finalized jsonb;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_status IS NULL
		OR p_status NOT IN ('failed', 'cancelled')
		OR p_failure_code IS NULL
		OR p_trigger IS NULL
		OR p_trigger NOT IN ('lease_expired', 'stop', 'orphaned', 'recovery_failed') THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_invalid_request';
	END IF;

	SELECT turns.* INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND OR v_turn.status <> 'running' OR v_turn.execution_mode <> 'worker_realtime' THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_invalid_status';
	END IF;

	SELECT jobs.* INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = v_turn.queue_job_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_queue_relationship_mismatch';
	END IF;

	-- Liveness is re-proved here, so no service-role caller can end a turn a
	-- live worker still holds: the lease must be expired, or stale with a Stop
	-- pending (Stop and recovery apply the same rule). A running turn whose
	-- queue row no worker holds (orphaned) is judged by the 90 s rule on its
	-- last sign of life.
	v_now := clock_timestamp();
	v_orphaned := v_job.status::text <> 'processing' OR v_job.processing_token IS NULL;
	v_silent_since := CASE
		WHEN v_turn.worker_lease_generation = v_turn.execution_generation
			AND v_turn.worker_lease_renewed_at IS NOT NULL
			THEN v_turn.worker_lease_renewed_at
		ELSE v_job.updated_at
	END;
	v_state := public.agentic_chat_turn_lease_state_v1(
		CASE WHEN v_orphaned THEN 'orphaned' ELSE v_turn.status END,
		v_turn.execution_generation,
		v_turn.worker_lease_generation,
		v_turn.worker_lease_renewed_at,
		CASE WHEN v_orphaned THEN v_silent_since ELSE v_job.updated_at END,
		v_now
	);
	IF NOT (
		v_state IN ('expired', 'abandoned')
		OR (v_state = 'stale' AND v_turn.cancel_requested_at IS NOT NULL)
	) THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_worker_alive:%', v_state
			USING ERRCODE = '55000';
	END IF;

	-- Every finalize path is fenced by the queue row's processing token. An
	-- orphaned row is adopted inside this transaction; the release below puts it
	-- straight back to a terminal state, so no claim can ever see it processing.
	IF v_orphaned THEN
		v_token := gen_random_uuid();
		UPDATE public.queue_jobs jobs
		SET status = 'processing',
			processing_token = v_token
		WHERE jobs.id = v_job.id;
	ELSE
		v_token := v_job.processing_token;
	END IF;

	-- The partial answer is whatever this generation made durable; recovery
	-- keeps it exactly (for workflow turns the stream state mirrors the durable
	-- answer, and finalize rejects any text that is not an extension of it).
	-- Bare mode, after repeated recovery failures, drops the projection, the
	-- one large structured value that can make finalize refuse.
	SELECT streams.* INTO v_stream
	FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id = v_turn.id
	FOR UPDATE;
	IF FOUND AND v_stream.execution_generation = v_turn.execution_generation THEN
		v_text := COALESCE(v_stream.assistant_text, '');
		IF NOT COALESCE(p_bare, false) THEN
			v_projection := COALESCE(v_stream.projection, '{}'::jsonb) - 'terminal';
		END IF;
	END IF;

	-- Counted before the terminal trigger turns started rows into uncertain. A
	-- write that may have happened outranks the requested code, also on Stop.
	SELECT count(*)::integer INTO v_uncertain_count
	FROM public.chat_turn_effects effects
	WHERE effects.turn_run_id = v_turn.id
		AND effects.state IN ('started', 'uncertain');
	v_failure_code := CASE
		WHEN v_uncertain_count > 0 THEN 'uncertain_external_commit'
		ELSE p_failure_code
	END;

	v_finalized := public.finalize_agentic_chat_turn(
		v_turn.id,
		v_turn.user_id,
		v_turn.queue_job_id,
		v_token,
		v_turn.execution_generation,
		p_status,
		CASE WHEN p_status = 'cancelled' THEN 'cancelled' ELSE 'worker_interrupted' END,
		left(v_failure_code, 128),
		CASE WHEN p_status = 'cancelled' AND v_text <> '' THEN gen_random_uuid() END,
		v_text,
		jsonb_build_object(
			'transport_contract_version', 'agentic_chat_worker_v1',
			'turn_run_id', v_turn.id,
			'execution_generation', v_turn.execution_generation,
			'recovered_from_stall', true,
			'recovery_trigger', p_trigger,
			-- The dead process took its exact round count with it; finalize
			-- derives calls from the durable ledger (zero means one round).
			'tool_round_count', 0
		),
		NULL,
		NULL,
		NULL,
		v_projection,
		jsonb_build_object(
			'recovered_from_stall', true,
			'recovery_trigger', p_trigger,
			'uncertain_effect_count', v_uncertain_count
		)
	);

	IF COALESCE(v_finalized->>'outcome', '') NOT IN ('finalized', 'already_terminal') THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_finalize_refused:%', v_finalized->>'outcome';
	END IF;

	-- Release the queue row through the existing terminal branch.
	PERFORM public.recover_agentic_chat_turn(
		v_turn.id,
		v_turn.queue_job_id,
		v_token,
		v_turn.execution_generation,
		'unknown',
		NULL
	);

	RETURN v_finalized || jsonb_build_object('uncertain_effect_count', v_uncertain_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.agentic_chat_recover_dead_turn_v1(
	p_turn_run_id uuid,
	p_trigger text,
	p_workflow_handoff boolean DEFAULT false,
	p_bare boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_request_role text;
	v_turn public.chat_turn_runs%ROWTYPE;
	v_job public.queue_jobs%ROWTYPE;
	v_now timestamptz;
	v_state text;
	v_orphaned boolean;
	v_silent_since timestamptz;
	v_failure_class text;
	v_is_workflow boolean := false;
	v_receipt jsonb;
	v_finalized jsonb;
	v_new_token uuid;
	v_base jsonb;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_service_role_required'
			USING ERRCODE = '42501';
	END IF;
	IF p_turn_run_id IS NULL OR p_trigger IS NULL OR p_trigger NOT IN ('lease_expired', 'stop') THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_invalid_request';
	END IF;

	-- Turn -> effects -> queue: the lock order of every worker primitive.
	SELECT turns.* INTO v_turn
	FROM public.chat_turn_runs turns
	WHERE turns.id = p_turn_run_id
	FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_not_found';
	END IF;
	IF v_turn.execution_mode <> 'worker_realtime' OR v_turn.queue_job_id IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_relationship_mismatch';
	END IF;

	PERFORM effects.id
	FROM public.chat_turn_effects effects
	WHERE effects.turn_run_id = v_turn.id
	ORDER BY effects.id
	FOR UPDATE;

	SELECT jobs.* INTO v_job
	FROM public.queue_jobs jobs
	WHERE jobs.id = v_turn.queue_job_id
	FOR UPDATE;
	IF NOT FOUND
		OR v_job.user_id IS DISTINCT FROM v_turn.user_id
		OR v_job.job_type::text <> 'agentic_chat_turn'
		OR v_job.dedup_key IS DISTINCT FROM 'agentic-chat-turn:' || v_turn.id::text
		OR v_job.metadata->>'turnRunId' IS DISTINCT FROM v_turn.id::text
		OR v_job.metadata->>'correlationId' IS DISTINCT FROM v_turn.correlation_id::text THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_queue_relationship_mismatch';
	END IF;

	v_orphaned := v_job.status::text <> 'processing' OR v_job.processing_token IS NULL;
	v_silent_since := CASE
		WHEN v_turn.status = 'running'
			AND v_turn.worker_lease_generation = v_turn.execution_generation
			AND v_turn.worker_lease_renewed_at IS NOT NULL
			THEN v_turn.worker_lease_renewed_at
		ELSE v_job.updated_at
	END;
	v_base := jsonb_build_object(
		'turn_run_id', v_turn.id,
		'queue_job_id', v_turn.queue_job_id,
		'user_id', v_turn.user_id,
		'execution_generation', v_turn.execution_generation,
		'started_at', COALESCE(v_turn.worker_started_at, v_job.started_at, v_turn.started_at),
		'silent_since', v_silent_since
	);

	-- Nothing a worker could still hold: a queued turn waits for the queued
	-- reaper, and a terminal one is done.
	IF v_orphaned AND v_turn.status <> 'running' THEN
		RETURN v_base || jsonb_build_object('outcome', 'not_dead', 'lease_state', 'unowned');
	END IF;

	-- Every decision below is re-made under the locks with a fresh clock.
	v_now := clock_timestamp();
	v_state := public.agentic_chat_turn_lease_state_v1(
		CASE WHEN v_orphaned THEN 'orphaned' ELSE v_turn.status END,
		v_turn.execution_generation,
		v_turn.worker_lease_generation,
		v_turn.worker_lease_renewed_at,
		CASE WHEN v_orphaned THEN v_silent_since ELSE v_job.updated_at END,
		v_now
	);
	v_base := v_base || jsonb_build_object('lease_state', v_state);
	-- Dead: expired. A requested Stop that the worker has not honored is
	-- finalized sooner, once the lease is stale (Stop and recovery agree).
	IF NOT (
		v_state IN ('expired', 'abandoned')
		OR (
			v_state = 'stale'
			AND v_turn.status = 'running'
			AND v_turn.cancel_requested_at IS NOT NULL
		)
	) THEN
		RETURN v_base || jsonb_build_object('outcome', 'not_dead');
	END IF;

	-- A running turn whose queue row no worker holds (failed, completed, or
	-- tokenless) can never be finished by a worker: end it here.
	IF v_orphaned THEN
		v_finalized := public.agentic_chat_finalize_dead_turn_v1(
			v_turn.id,
			CASE WHEN v_turn.cancel_requested_at IS NOT NULL THEN 'cancelled' ELSE 'failed' END,
			CASE WHEN v_turn.cancel_requested_at IS NOT NULL THEN 'cancelled' ELSE 'queue_orphaned' END,
			CASE WHEN p_trigger = 'stop' THEN 'stop' ELSE 'orphaned' END,
			p_bare
		);
		RETURN v_base || v_finalized || jsonb_build_object('outcome', 'finalized');
	END IF;

	-- A worker finalized the turn but died before releasing its queue row.
	IF v_turn.status IN ('completed', 'failed', 'cancelled') THEN
		UPDATE public.queue_jobs jobs
		SET status = v_turn.status::public.queue_status,
			processing_token = NULL,
			completed_at = COALESCE(jobs.completed_at, v_now),
			error_message = CASE
				WHEN v_turn.status = 'completed' THEN jobs.error_message
				ELSE COALESCE(jobs.error_message, 'Agentic chat turn ' || v_turn.status)
			END,
			updated_at = v_now
		WHERE jobs.id = v_job.id
			AND jobs.processing_token = v_job.processing_token;
		RETURN v_base || jsonb_build_object('outcome', 'terminal_reconciled', 'status', v_turn.status);
	END IF;

	-- A worker claimed the queue row and died before claiming the turn: nothing
	-- ran, so the row goes back to the queue (the queued reaper still bounds
	-- the wait). With no attempts left it ends as a queued timeout.
	IF v_turn.status = 'queued' THEN
		IF v_turn.cancel_requested_at IS NULL
			AND NOT COALESCE(p_bare, false)
			AND COALESCE(v_job.attempts, 0) + 1 < COALESCE(v_job.max_attempts, 3) THEN
			UPDATE public.queue_jobs jobs
			SET status = 'pending',
				processing_token = NULL,
				started_at = NULL,
				completed_at = NULL,
				attempts = COALESCE(jobs.attempts, 0) + 1,
				error_message = 'Agentic chat worker lease expired before the turn started',
				scheduled_for = v_now,
				updated_at = v_now
			WHERE jobs.id = v_job.id
				AND jobs.processing_token = v_job.processing_token;
			RETURN v_base || jsonb_build_object('outcome', 'requeued', 'status', 'queued');
		END IF;
		v_receipt := public.request_agentic_chat_turn_cancel(
			v_turn.id,
			v_turn.user_id,
			'timeout',
			'sweeper'
		);
		RETURN v_base || v_receipt || jsonb_build_object('outcome', 'finalized');
	END IF;

	IF v_turn.status <> 'running' THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_invalid_status';
	END IF;

	-- After repeated recovery failures: no workflow policy, no retry decision,
	-- no projection. Just end the turn with its durable text.
	IF COALESCE(p_bare, false) THEN
		v_finalized := public.agentic_chat_finalize_dead_turn_v1(
			v_turn.id,
			CASE WHEN v_turn.cancel_requested_at IS NOT NULL THEN 'cancelled' ELSE 'failed' END,
			CASE WHEN v_turn.cancel_requested_at IS NOT NULL THEN 'cancelled' ELSE 'recovery_failed' END,
			'recovery_failed',
			true
		);
		RETURN v_base || v_finalized || jsonb_build_object('outcome', 'finalized');
	END IF;

	-- The same classes the worker sweep derives from its claim receipt.
	v_failure_class := CASE
		WHEN v_turn.execution_started_at IS NULL AND v_turn.cancel_requested_at IS NULL
			THEN 'timeout_pre_start'
		ELSE 'timeout_post_start'
	END;

	-- Workflow turns (prototype lane) keep their own atomic recovery policy,
	-- including a pending Stop: their answer and cost settle from workflow truth.
	-- The table exists only once 20260914203007 is applied.
	IF to_regclass('public.chat_turn_workflow_runs') IS NOT NULL THEN
		SELECT EXISTS (
			SELECT 1 FROM public.chat_turn_workflow_runs runs WHERE runs.turn_run_id = v_turn.id
		) INTO v_is_workflow;
	END IF;
	IF v_is_workflow THEN
		v_receipt := public.recover_agentic_chat_workflow_turn_v1(
			v_turn.id,
			v_turn.queue_job_id,
			v_job.processing_token,
			v_turn.execution_generation,
			v_failure_class,
			'Agentic Chat worker lease expired'
		);
		IF v_receipt->>'outcome' IN ('retry_scheduled', 'already_requeued') THEN
			RETURN v_base || jsonb_build_object('outcome', 'requeued', 'status', 'queued');
		ELSIF v_receipt->>'outcome' = 'terminal_reconciled' THEN
			RETURN v_base || jsonb_build_object('outcome', 'terminal_reconciled');
		ELSIF v_receipt->>'outcome' IN ('stale_generation', 'ownership_lost') THEN
			RETURN v_base || jsonb_build_object('outcome', 'skipped', 'reason', v_receipt->>'outcome');
		ELSIF v_receipt->>'outcome' <> 'policy_denied' THEN
			-- The run must end (cancel_requested ends it as cancelled). Until it is
			-- abandoned, a live worker renders that from durable workflow truth: the
			-- token rotates (fencing the old owner) and the lease is NOT refreshed,
			-- so a handoff the worker cannot converge is simply handed off again on
			-- a later sweep until the run is abandoned and ends here in SQL.
			IF COALESCE(p_workflow_handoff, false) AND v_state <> 'abandoned' THEN
				v_new_token := gen_random_uuid();
				UPDATE public.queue_jobs jobs
				SET processing_token = v_new_token
				WHERE jobs.id = v_job.id
					AND jobs.status = 'processing'
					AND jobs.processing_token = v_job.processing_token;
				-- The rotation stamps the queue heartbeat (its trigger). A pre-lease
				-- turn is therefore pinned to a lease dated at its real silence, so
				-- repeated handoffs still reach the abandoned mark.
				UPDATE public.chat_turn_runs turns
				SET worker_lease_generation = turns.execution_generation,
					worker_lease_renewed_at = v_silent_since
				WHERE turns.id = v_turn.id
					AND turns.worker_lease_generation IS DISTINCT FROM turns.execution_generation;
				RETURN v_base || jsonb_build_object(
					'outcome', 'workflow_handoff',
					'workflow_outcome', v_receipt->>'outcome',
					'processing_token', v_new_token,
					'correlation_id', v_turn.correlation_id
				);
			END IF;
			-- No worker rendered it within a further lease period: end it here.
			IF v_state <> 'abandoned' THEN
				RETURN v_base || jsonb_build_object(
					'outcome', 'workflow_deferred',
					'workflow_outcome', v_receipt->>'outcome'
				);
			END IF;
			-- The stream state mirrors the durable workflow answer, so the kept
			-- text is the same prefix a worker would have rendered.
			IF v_receipt->>'outcome' = 'cancel_requested' THEN
				v_finalized := public.agentic_chat_finalize_dead_turn_v1(
					v_turn.id, 'cancelled', 'cancelled', p_trigger
				);
			ELSE
				v_finalized := public.agentic_chat_finalize_dead_turn_v1(
					v_turn.id,
					'failed',
					left('workflow_' || (v_receipt->>'outcome'), 128),
					p_trigger
				);
			END IF;
			RETURN v_base || v_finalized || jsonb_build_object('outcome', 'finalized');
		END IF;
	END IF;

	v_receipt := public.recover_agentic_chat_turn(
		v_turn.id,
		v_turn.queue_job_id,
		v_job.processing_token,
		v_turn.execution_generation,
		v_failure_class,
		'Agentic Chat worker lease expired'
	);
	IF v_receipt->>'outcome' IN ('retry_scheduled', 'already_requeued') THEN
		RETURN v_base || jsonb_build_object('outcome', 'requeued', 'status', 'queued');
	ELSIF v_receipt->>'outcome' IN ('queue_reconciled', 'already_reconciled') THEN
		RETURN v_base || jsonb_build_object('outcome', 'terminal_reconciled');
	ELSIF v_receipt->>'outcome' = 'finalize_cancelled' THEN
		v_finalized := public.agentic_chat_finalize_dead_turn_v1(
			v_turn.id, 'cancelled', 'cancelled', p_trigger
		);
	ELSIF v_receipt->>'outcome' = 'finalize_failed' THEN
		v_finalized := public.agentic_chat_finalize_dead_turn_v1(
			v_turn.id, 'failed', v_receipt->>'failure_code', p_trigger
		);
	ELSE
		RETURN v_base || jsonb_build_object('outcome', 'skipped', 'reason', v_receipt->>'outcome');
	END IF;
	RETURN v_base || v_finalized || jsonb_build_object('outcome', 'finalized');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. The recovery batch (chat worker every 15 s, web cron every minute)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recover_dead_agentic_chat_turns(
	p_batch_size integer DEFAULT 25,
	p_workflow_handoff boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
-- Queue and effect rows are locked blocking inside one turn's recovery; a row
-- held elsewhere for this long skips that turn rather than stalling the batch.
SET lock_timeout = '2s'
AS $function$
DECLARE
	-- A turn whose recovery keeps raising is backed off (15 s x 2^failures, at
	-- most 10 min) and sorted last, so it can never starve healthy dead turns.
	-- From the third failure it is ended bare (durable text only: no projection,
	-- retry decision, or workflow policy); from the eighth it is parked and
	-- reported every sweep.
	c_bare_after CONSTANT integer := 3;
	c_park_after CONSTANT integer := 8;
	v_request_role text;
	v_batch_size integer := GREATEST(LEAST(COALESCE(p_batch_size, 25), 100), 1);
	v_now timestamptz;
	v_turn_ids uuid[];
	v_turn_id uuid;
	v_failures integer;
	v_parked integer;
	v_result jsonb;
	v_results jsonb := '[]'::jsonb;
	v_handoffs jsonb := '[]'::jsonb;
	v_candidate_count integer;
	v_requeued integer := 0;
	v_finalized integer := 0;
	v_reconciled integer := 0;
	v_handed_off integer := 0;
	v_deferred integer := 0;
	v_not_dead integer := 0;
	v_skipped integer := 0;
	v_failed integer := 0;
BEGIN
	v_request_role := COALESCE(
		NULLIF(
			NULLIF(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
			''
		),
		current_user
	);
	IF v_request_role <> 'service_role' THEN
		RAISE EXCEPTION 'agentic_chat_dead_turn_recovery_service_role_required'
			USING ERRCODE = '42501';
	END IF;

	v_now := clock_timestamp();

	-- Two indexed sources: the few worker-held queue rows (turn reached by its
	-- primary key), and running turns whose queue row no worker holds. Nothing
	-- is locked here; each turn is locked alone below, and every decision is
	-- re-made under its locks.
	WITH owned AS (
		SELECT turns.id, turns.status, turns.execution_generation,
			turns.worker_lease_generation, turns.worker_lease_renewed_at,
			turns.cancel_requested_at, jobs.updated_at AS heartbeat_at, false AS orphaned
		FROM public.queue_jobs jobs
		JOIN public.chat_turn_runs turns
			ON turns.id = CASE
				WHEN jobs.metadata->>'turnRunId'
					~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
					THEN (jobs.metadata->>'turnRunId')::uuid
			END
			AND turns.queue_job_id = jobs.id
		WHERE jobs.job_type = 'agentic_chat_turn'
			AND jobs.status = 'processing'
			AND jobs.processing_token IS NOT NULL
			AND turns.execution_mode = 'worker_realtime'
	),
	orphaned AS (
		SELECT turns.id, turns.status, turns.execution_generation,
			turns.worker_lease_generation, turns.worker_lease_renewed_at,
			turns.cancel_requested_at, jobs.updated_at AS heartbeat_at, true AS orphaned
		FROM public.chat_turn_runs turns
		JOIN public.queue_jobs jobs ON jobs.id = turns.queue_job_id
		WHERE turns.status = 'running'
			AND turns.execution_mode = 'worker_realtime'
			AND (jobs.status <> 'processing' OR jobs.processing_token IS NULL)
	),
	candidates AS (
		SELECT source.id, silence.silent_since,
			COALESCE(failures.failure_count, 0) AS failure_count,
			failures.last_failed_at
		FROM (SELECT * FROM owned UNION ALL SELECT * FROM orphaned) source
		CROSS JOIN LATERAL (
			SELECT CASE
				WHEN source.status = 'running'
					AND source.worker_lease_generation = source.execution_generation
					AND source.worker_lease_renewed_at IS NOT NULL
					THEN source.worker_lease_renewed_at
				ELSE source.heartbeat_at
			END AS silent_since
		) silence
		CROSS JOIN LATERAL (
			SELECT public.agentic_chat_turn_lease_state_v1(
				CASE WHEN source.orphaned THEN 'orphaned' ELSE source.status END,
				source.execution_generation,
				source.worker_lease_generation,
				source.worker_lease_renewed_at,
				CASE WHEN source.orphaned THEN silence.silent_since ELSE source.heartbeat_at END,
				v_now
			) AS state
		) leases
		LEFT JOIN public.chat_turn_recovery_failures failures
			ON failures.turn_run_id = source.id
		WHERE leases.state IN ('expired', 'abandoned')
			OR (
				leases.state = 'stale'
				AND source.status = 'running'
				AND source.cancel_requested_at IS NOT NULL
			)
	)
	SELECT
		COALESCE((
			SELECT array_agg(picked.id ORDER BY picked.failing, picked.silent_since, picked.id)
			FROM (
				SELECT candidates.id, candidates.silent_since,
					candidates.failure_count > 0 AS failing
				FROM candidates
				WHERE candidates.failure_count < c_park_after
					AND (
						candidates.last_failed_at IS NULL
						OR candidates.last_failed_at <= v_now - LEAST(
							interval '10 minutes',
							interval '15 seconds' * power(2, candidates.failure_count)
						)
					)
				ORDER BY candidates.failure_count > 0, candidates.silent_since, candidates.id
				LIMIT v_batch_size
			) picked
		), '{}'),
		(SELECT count(*)::integer FROM candidates WHERE candidates.failure_count >= c_park_after)
	INTO v_turn_ids, v_parked;

	v_candidate_count := COALESCE(array_length(v_turn_ids, 1), 0);

	FOREACH v_turn_id IN ARRAY v_turn_ids LOOP
		-- One turn at a time, never waiting: a turn a live worker (or another
		-- sweep) holds right now is skipped and seen again on a later sweep.
		PERFORM 1
		FROM public.chat_turn_runs turns
		WHERE turns.id = v_turn_id
		FOR UPDATE SKIP LOCKED;
		IF NOT FOUND THEN
			v_result := jsonb_build_object(
				'turn_run_id', v_turn_id, 'outcome', 'skipped', 'reason', 'locked'
			);
		ELSE
			SELECT failures.failure_count INTO v_failures
			FROM public.chat_turn_recovery_failures failures
			WHERE failures.turn_run_id = v_turn_id;
			BEGIN
				v_result := public.agentic_chat_recover_dead_turn_v1(
					v_turn_id,
					'lease_expired',
					COALESCE(p_workflow_handoff, false),
					COALESCE(v_failures, 0) >= c_bare_after
				);
			EXCEPTION
				WHEN lock_not_available THEN
					v_result := jsonb_build_object(
						'turn_run_id', v_turn_id, 'outcome', 'skipped', 'reason', 'locked'
					);
				WHEN OTHERS THEN
					v_result := jsonb_build_object(
						'turn_run_id', v_turn_id,
						'outcome', 'failed',
						'error', left(SQLERRM, 500),
						'recovery_failure_count', COALESCE(v_failures, 0) + 1
					);
					-- Recorded outside the rolled-back attempt; this table has no
					-- triggers, so recording can never fail the batch.
					INSERT INTO public.chat_turn_recovery_failures AS failures (
						turn_run_id, failure_count, first_failed_at, last_failed_at,
						last_sqlstate, last_error
					) VALUES (
						v_turn_id, 1, clock_timestamp(), clock_timestamp(),
						SQLSTATE, left(SQLERRM, 500)
					)
					ON CONFLICT (turn_run_id) DO UPDATE
					SET failure_count = failures.failure_count + 1,
						last_failed_at = EXCLUDED.last_failed_at,
						last_sqlstate = EXCLUDED.last_sqlstate,
						last_error = EXCLUDED.last_error;
					RAISE WARNING 'agentic_chat_dead_turn_recovery_failed turn=% failures=% sqlstate=% message=%',
						v_turn_id, COALESCE(v_failures, 0) + 1, SQLSTATE, SQLERRM;
			END;
			IF v_failures IS NOT NULL
				AND v_result->>'outcome' IN ('requeued', 'finalized', 'terminal_reconciled') THEN
				DELETE FROM public.chat_turn_recovery_failures failures
				WHERE failures.turn_run_id = v_turn_id;
			END IF;
		END IF;

		CASE v_result->>'outcome'
			WHEN 'requeued' THEN v_requeued := v_requeued + 1;
			WHEN 'finalized' THEN v_finalized := v_finalized + 1;
			WHEN 'terminal_reconciled' THEN v_reconciled := v_reconciled + 1;
			WHEN 'workflow_handoff' THEN v_handed_off := v_handed_off + 1;
			WHEN 'workflow_deferred' THEN v_deferred := v_deferred + 1;
			WHEN 'not_dead' THEN v_not_dead := v_not_dead + 1;
			WHEN 'failed' THEN v_failed := v_failed + 1;
			ELSE v_skipped := v_skipped + 1;
		END CASE;

		IF v_result->>'outcome' = 'workflow_handoff' THEN
			v_handoffs := v_handoffs || jsonb_build_array(v_result);
		END IF;
		-- Results never carry a processing token.
		v_results := v_results || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
			'turn_run_id', v_result->'turn_run_id',
			'queue_job_id', v_result->'queue_job_id',
			'execution_generation', v_result->'execution_generation',
			'started_at', v_result->'started_at',
			'silent_since', v_result->'silent_since',
			'lease_state', v_result->'lease_state',
			'outcome', v_result->'outcome',
			'status', v_result->'status',
			'failure_code', v_result->'failure_code',
			'uncertain_effect_count', v_result->'uncertain_effect_count',
			'workflow_outcome', v_result->'workflow_outcome',
			'recovery_failure_count', v_result->'recovery_failure_count',
			'reason', v_result->'reason',
			'error', v_result->'error'
		)));
	END LOOP;

	RETURN jsonb_build_object(
		'candidate_count', v_candidate_count,
		'requeued_count', v_requeued,
		'finalized_count', v_finalized,
		'reconciled_count', v_reconciled,
		'handoff_count', v_handed_off,
		'deferred_count', v_deferred,
		'not_dead_count', v_not_dead,
		'skipped_count', v_skipped,
		'failed_count', v_failed,
		'parked_count', v_parked,
		'has_more', v_candidate_count = v_batch_size,
		'batch_size', v_batch_size,
		'results', v_results,
		'handoffs', v_handoffs
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Stop finalizes a turn whose worker cannot hear it
-- ---------------------------------------------------------------------------

DO $migration$
DECLARE
	v_signature regprocedure :=
		'public.request_agentic_chat_turn_cancel(uuid,uuid,text,text)'::regprocedure;
	v_definition text;
	v_patched text;
	v_needle text :=
		E'\tRETURN jsonb_build_object(\n'
		|| E'\t\t''outcome'', ''cancel_requested'',\n';
	v_replacement text :=
		E'\t-- 20260924000100 (turn leases): a worker silent for the Stop threshold\n'
		|| E'\t-- cannot hear the signal. Finalize now (partial text kept, effects\n'
		|| E'\t-- closed); on any failure keep the signal and let recovery finish it.\n'
		|| E'\tBEGIN\n'
		|| E'\t\tv_finalized := public.agentic_chat_recover_dead_turn_v1(v_turn.id, ''stop'', false);\n'
		|| E'\tEXCEPTION\n'
		|| E'\t\tWHEN OTHERS THEN\n'
		|| E'\t\t\tRAISE WARNING ''agentic_chat_cancel_dead_worker_finalize_failed turn=% sqlstate=% message=%'',\n'
		|| E'\t\t\t\tv_turn.id, SQLSTATE, SQLERRM;\n'
		|| E'\t\t\tv_finalized := NULL;\n'
		|| E'\tEND;\n'
		|| E'\tIF v_finalized->>''outcome'' = ''finalized'' THEN\n'
		|| E'\t\tRETURN v_finalized || jsonb_build_object(\n'
		|| E'\t\t\t''outcome'', CASE WHEN v_finalized->>''status'' = ''cancelled''\n'
		|| E'\t\t\t\tTHEN ''cancelled'' ELSE ''already_terminal'' END,\n'
		|| E'\t\t\t''stopped_without_worker'', true\n'
		|| E'\t\t);\n'
		|| E'\tEND IF;\n'
		|| E'\n'
		|| E'\tRETURN jsonb_build_object(\n'
		|| E'\t\t''outcome'', ''cancel_requested'',\n';
	v_after text;
BEGIN
	SELECT pg_get_functiondef(v_signature) INTO STRICT v_definition;
	IF position('agentic_chat_recover_dead_turn_v1' IN v_definition) > 0 THEN
		RETURN;
	END IF;
	v_after := substr(v_definition, position(v_needle IN v_definition) + length(v_needle));
	IF position(v_needle IN v_definition) = 0 OR position(v_needle IN v_after) > 0 THEN
		RAISE EXCEPTION 'agentic_chat_turn_leases_cancel_preflight_failed';
	END IF;
	v_patched := replace(v_definition, v_needle, v_replacement);
	EXECUTE v_patched;
END;
$migration$;

COMMENT ON FUNCTION public.request_agentic_chat_turn_cancel(uuid, uuid, text, text) IS
	'Service-only Stop. Queued turns finalize cancelled atomically. Running turns record the durable signal the worker observes; when the worker lease is stale (>= 45 s) or expired, the turn is finalized cancelled in the same transaction (outcome cancelled, stopped_without_worker true).';

-- ---------------------------------------------------------------------------
-- 9. The queued reaper times a requeued turn from its requeue, not admission
-- ---------------------------------------------------------------------------

-- 20260924000000 times out a queued turn ten minutes after admission. A turn
-- that ran, lost its worker, and was requeued by recovery would then be
-- cancelled within a minute instead of getting its silent retry. The clock
-- now starts when the turn entered its current queued state: the queue row is
-- written (updated_at) when it is admitted and again when it is requeued.
DO $migration$
DECLARE
	v_signature regprocedure :=
		'public.reap_stranded_queued_agentic_chat_turns(integer,integer)'::regprocedure;
	v_definition text;
	v_needle text := E'\t\t\tAND turns.created_at <= v_cutoff\n';
	v_replacement text :=
		E'\t\t\t-- 20260924000100: from entering the current queued state (admission\n'
		|| E'\t\t\t-- or a recovery requeue), so a requeued turn gets its retry.\n'
		|| E'\t\t\tAND GREATEST(turns.created_at, jobs.updated_at) <= v_cutoff\n';
	v_after text;
BEGIN
	SELECT pg_get_functiondef(v_signature) INTO STRICT v_definition;
	IF position(v_replacement IN v_definition) > 0 THEN
		RETURN;
	END IF;
	v_after := substr(v_definition, position(v_needle IN v_definition) + length(v_needle));
	IF position(v_needle IN v_definition) = 0 OR position(v_needle IN v_after) > 0 THEN
		RAISE EXCEPTION 'agentic_chat_turn_leases_reaper_preflight_failed';
	END IF;
	EXECUTE replace(v_definition, v_needle, v_replacement);
END;
$migration$;

COMMENT ON FUNCTION public.reap_stranded_queued_agentic_chat_turns(integer, integer) IS
	'Service-only bounded SKIP LOCKED sweeper: worker turns still queued (job unclaimed) at least 300s (default 600s) after entering their current queued state (admission or a recovery requeue) are finalized through request_agentic_chat_turn_cancel(timeout, sweeper).';

-- ---------------------------------------------------------------------------
-- Privileges and descriptions
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.agentic_chat_turn_lease_state_v1(
	text, integer, integer, timestamptz, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_turn_lease_state_v1(
	text, integer, integer, timestamptz, timestamptz, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.renew_agentic_chat_turn_lease(uuid, uuid, uuid, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_agentic_chat_turn_lease(uuid, uuid, uuid, integer)
	TO service_role;

REVOKE ALL ON FUNCTION public.resolve_agentic_chat_effects_on_terminal_v1()
	FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.agentic_chat_finalize_dead_turn_v1(uuid, text, text, text, boolean)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_finalize_dead_turn_v1(uuid, text, text, text, boolean)
	TO service_role;

REVOKE ALL ON FUNCTION public.agentic_chat_recover_dead_turn_v1(uuid, text, boolean, boolean)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agentic_chat_recover_dead_turn_v1(uuid, text, boolean, boolean)
	TO service_role;

REVOKE ALL ON FUNCTION public.recover_dead_agentic_chat_turns(integer, boolean)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_dead_agentic_chat_turns(integer, boolean)
	TO service_role;

COMMENT ON FUNCTION public.agentic_chat_turn_lease_state_v1(
	text, integer, integer, timestamptz, timestamptz, timestamptz
) IS
	'The only Agentic Chat worker-liveness policy: held | stale (>= 45 s, Stop may finalize) | expired (>= 90 s leased, 420 s unleased running, 90 s unowned) | abandoned (2x expired).';
COMMENT ON FUNCTION public.renew_agentic_chat_turn_lease(uuid, uuid, uuid, integer) IS
	'Service-only lease renewal for the owning worker: renewed only while running at this generation with this processing token and an unexpired lease; otherwise lost with a reason. Never throws for ownership.';
COMMENT ON FUNCTION public.resolve_agentic_chat_effects_on_terminal_v1() IS
	'Terminal turns close dangling effects: reserved -> cancelled, started -> uncertain.';
COMMENT ON FUNCTION public.agentic_chat_finalize_dead_turn_v1(uuid, text, text, text, boolean) IS
	'Service-only: finalize a running turn whose worker is gone (asserts the lease is expired, or stale with a Stop pending), keeping its durable partial text and projection (none when bare), then release its queue row. A started/uncertain effect makes the failure code uncertain_external_commit, also for cancelled.';
COMMENT ON FUNCTION public.agentic_chat_recover_dead_turn_v1(uuid, text, boolean, boolean) IS
	'Service-only: one dead turn under its locks. Requeue if the model never started, else finalize (partial text kept); orphaned running turns are finalized; workflow turns via recover_agentic_chat_workflow_turn_v1, with a token-rotating handoff to a live worker until abandoned.';
COMMENT ON FUNCTION public.recover_dead_agentic_chat_turns(integer, boolean) IS
	'Service-only bounded recovery of worker turns whose lease expired (or is stale with a Stop pending), including running turns whose queue row no worker holds. Each turn is locked alone (SKIP LOCKED); failing turns back off, end bare, then park. The chat worker calls it every 15 s with p_workflow_handoff; the web cron every minute without.';
COMMENT ON TRIGGER trg_chat_turn_runs_resolve_effects_on_terminal ON public.chat_turn_runs IS
	'Every terminal transition closes dangling effects (reserved -> cancelled, started -> uncertain).';

COMMIT;
