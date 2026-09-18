-- supabase/migrations/20260918200300_freshness_radar_turn_signal_trigger.sql
-- Jev freshness radar (Tasker 88), part 4 of 4: the per-session debounced
-- turn signal. Frozen plan: docs/architecture/jev-freshness-radar-v1-plan.md §1–2.
--
-- When a chat turn reaches status 'completed', a cohort user's session gets one
-- pending freshness_radar_signals row. Each further completed turn in that
-- session pushes due_at to (last turn + 60s), capped at (first turn + 10m), so a
-- multi-message brain dump becomes one scan.
--
-- The queue job's dedup key contains the signal id, never the session id:
-- add_queue_job returns an existing *processing* job for the same key, so a
-- per-session key would silently drop dumps made while a scan is running. A turn
-- that completes while its session's signal is processing therefore creates a
-- fresh pending signal with a fresh key.
--
-- Terminal writes always win: every failure (including a missing or failing
-- add_queue_job) is demoted to a WARNING inside a subtransaction, which also
-- rolls back the half-written signal.
--
-- Rollback: DROP TRIGGER trg_chat_turn_runs_freshness_radar ON chat_turn_runs;
--           DROP FUNCTION enqueue_freshness_radar_signal_v1();

CREATE OR REPLACE FUNCTION public.enqueue_freshness_radar_signal_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_now timestamptz := clock_timestamp();
	v_signal_id uuid;
	v_due_at timestamptz;
	v_queue_job_id text;
	v_job_id uuid;
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM public.feature_flags flags
		WHERE flags.user_id = NEW.user_id
			AND flags.feature_name = 'freshness_radar'
			AND flags.enabled = true
	) THEN
		RETURN NULL;
	END IF;

	-- A project-scoped turn, or any turn that attempted a write.
	IF NEW.project_id IS NULL AND NEW.mutation_reserved_at IS NULL THEN
		RETURN NULL;
	END IF;

	-- Skip short acknowledgements unless the turn attempted a write.
	IF NEW.mutation_reserved_at IS NULL
		AND char_length(btrim(COALESCE(NEW.request_message, ''))) < 40 THEN
		RETURN NULL;
	END IF;

	-- Workflow review turns are read-only analysis, not brain dumps.
	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_workflow_runs runs
		WHERE runs.turn_run_id = NEW.id
	) THEN
		RETURN NULL;
	END IF;

	INSERT INTO public.freshness_radar_signals AS signals (
		session_id,
		user_id,
		status,
		project_id_hints,
		last_turn_run_id,
		turn_count,
		first_turn_at,
		last_turn_at,
		due_at,
		max_due_at
	) VALUES (
		NEW.session_id,
		NEW.user_id,
		'pending',
		CASE WHEN NEW.project_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[NEW.project_id] END,
		NEW.id,
		1,
		v_now,
		v_now,
		v_now + interval '60 seconds',
		v_now + interval '10 minutes'
	)
	ON CONFLICT (session_id) WHERE status = 'pending'
	DO UPDATE SET
		due_at = LEAST(v_now + interval '60 seconds', signals.max_due_at),
		turn_count = signals.turn_count + 1,
		last_turn_at = v_now,
		last_turn_run_id = EXCLUDED.last_turn_run_id,
		project_id_hints = CASE
			WHEN NEW.project_id IS NULL OR NEW.project_id = ANY (signals.project_id_hints)
				THEN signals.project_id_hints
			ELSE signals.project_id_hints || NEW.project_id
		END
	RETURNING signals.id, signals.due_at, signals.queue_job_id
	INTO v_signal_id, v_due_at, v_queue_job_id;

	-- Same key for every turn of this signal: later turns reuse the pending job,
	-- and the worker reschedules itself when it wakes before due_at.
	v_job_id := public.add_queue_job(
		NEW.user_id,
		'freshness_radar_scan',
		jsonb_build_object(
			'signalId', v_signal_id,
			'sessionId', NEW.session_id,
			'userId', NEW.user_id
		),
		9,
		v_due_at,
		'freshness-radar:' || v_signal_id::text
	);

	IF v_job_id IS NOT NULL AND v_queue_job_id IS DISTINCT FROM v_job_id::text THEN
		UPDATE public.freshness_radar_signals
		SET queue_job_id = v_job_id::text
		WHERE id = v_signal_id;
	END IF;

	RETURN NULL;
EXCEPTION WHEN OTHERS THEN
	-- The radar is best-effort; the terminal turn write must always commit.
	RAISE WARNING 'enqueue_freshness_radar_signal_v1 failed for turn %: % (%)',
		NEW.id, SQLERRM, SQLSTATE;
	RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_freshness_radar_signal_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_freshness_radar_signal_v1() FROM anon, authenticated;

COMMENT ON FUNCTION public.enqueue_freshness_radar_signal_v1() IS
	'Tasker 88: debounce completed cohort chat turns into one pending freshness_radar_signals row per session and enqueue freshness_radar_scan (dedup freshness-radar:<signalId>). Never raises.';

DROP TRIGGER IF EXISTS trg_chat_turn_runs_freshness_radar ON public.chat_turn_runs;
CREATE TRIGGER trg_chat_turn_runs_freshness_radar
AFTER UPDATE OF status ON public.chat_turn_runs
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
EXECUTE FUNCTION public.enqueue_freshness_radar_signal_v1();
