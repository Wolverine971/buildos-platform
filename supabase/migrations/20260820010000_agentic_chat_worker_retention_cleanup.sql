-- supabase/migrations/20260820010000_agentic_chat_worker_retention_cleanup.sql
-- Agentic Chat Worker Phase 5: bounded terminal-artifact retention cleanup.
--
-- Policy locked by the Phase 0 operating contract:
--   * stream state, durable events, cancellation signals, and frozen inputs:
--     at least seven days after terminalization;
--   * ordinary mutation effects: at least 30 days after both the turn and
--     effect are terminal;
--   * effects explicitly reconciled from uncertain: at least 90 days after
--     reconciliation;
--   * unresolved started/uncertain effects are never deleted.
--
-- The cleanup RPC is service-only and bounds each table independently. Active
-- turns are excluded by both the candidate query and row-level delete guards.

BEGIN;

ALTER TABLE public.chat_turn_effects
	ADD COLUMN IF NOT EXISTS uncertain_reconciled_at timestamptz;

-- The old schema did not record whether a succeeded/failed row had passed
-- through `uncertain`. Conservatively retain every pre-migration terminal row
-- on the 90-day policy. New direct terminal effects leave this column null.
--
-- The existing transition trigger intentionally makes terminal effects
-- immutable, including otherwise additive column updates. Disable only that
-- trigger while this transaction holds the table lock, perform the one-time
-- metadata backfill, and restore it before commit. Without this step a
-- production database containing any terminal effect rejects the migration.
ALTER TABLE public.chat_turn_effects
	DISABLE TRIGGER trg_chat_turn_effects_transition;
UPDATE public.chat_turn_effects
SET uncertain_reconciled_at = updated_at
WHERE state IN ('succeeded', 'failed')
	AND uncertain_reconciled_at IS NULL;
ALTER TABLE public.chat_turn_effects
	ENABLE TRIGGER trg_chat_turn_effects_transition;

ALTER TABLE public.chat_turn_effects
	DROP CONSTRAINT IF EXISTS chk_chat_turn_effects_uncertain_reconciliation,
	ADD CONSTRAINT chk_chat_turn_effects_uncertain_reconciliation
	CHECK (
		uncertain_reconciled_at IS NULL
		OR state IN ('succeeded', 'failed')
	);

COMMENT ON COLUMN public.chat_turn_effects.uncertain_reconciled_at IS
	'Starts the separately protected 90-day audit-retention window. Set for explicit uncertain -> succeeded/failed reconciliation and conservatively backfilled for pre-migration terminal rows whose prior state cannot be proven.';

CREATE OR REPLACE FUNCTION public.record_agentic_chat_effect_uncertain_reconciliation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
	IF OLD.state = 'uncertain' AND NEW.state IN ('succeeded', 'failed') THEN
		NEW.uncertain_reconciled_at := clock_timestamp();
	ELSIF NEW.uncertain_reconciled_at IS DISTINCT FROM OLD.uncertain_reconciled_at THEN
		RAISE EXCEPTION 'agentic_chat_effect_uncertain_reconciliation_is_database_owned';
	END IF;

	RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_agentic_chat_effect_uncertain_reconciliation()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zz_trg_chat_turn_effects_uncertain_reconciliation
	ON public.chat_turn_effects;
CREATE TRIGGER zz_trg_chat_turn_effects_uncertain_reconciliation
BEFORE UPDATE ON public.chat_turn_effects
FOR EACH ROW EXECUTE FUNCTION public.record_agentic_chat_effect_uncertain_reconciliation();

CREATE OR REPLACE FUNCTION public.reject_protected_agentic_chat_effect_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
	v_effect_terminal_at timestamptz;
BEGIN
	SELECT
		turns.status,
		COALESCE(turns.terminalized_at, turns.finished_at)
	INTO
		v_status,
		v_terminal_at
	FROM public.chat_turn_runs turns
	WHERE turns.id = OLD.turn_run_id;

	IF NOT FOUND OR v_status IN ('queued', 'running') THEN
		RAISE EXCEPTION 'agentic_chat_active_effect_cannot_be_deleted';
	END IF;

	IF OLD.state = 'uncertain' THEN
		RAISE EXCEPTION 'agentic_chat_uncertain_effect_cannot_be_deleted';
	END IF;
	IF OLD.state = 'started' THEN
		RAISE EXCEPTION 'agentic_chat_unresolved_started_effect_cannot_be_deleted';
	END IF;
	IF v_status NOT IN ('completed', 'failed', 'cancelled') OR v_terminal_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_effect_terminal_turn_required';
	END IF;

	IF OLD.uncertain_reconciled_at IS NOT NULL THEN
		IF clock_timestamp() < GREATEST(v_terminal_at, OLD.uncertain_reconciled_at)
			+ interval '90 days' THEN
			RAISE EXCEPTION 'agentic_chat_uncertain_effect_audit_retention_not_elapsed';
		END IF;
		RETURN OLD;
	END IF;

	v_effect_terminal_at := COALESCE(OLD.finished_at, OLD.updated_at, OLD.created_at);
	IF clock_timestamp() < GREATEST(v_terminal_at, v_effect_terminal_at)
		+ interval '30 days' THEN
		RAISE EXCEPTION 'agentic_chat_effect_retention_not_elapsed';
	END IF;

	RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_protected_agentic_chat_effect_delete()
	FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reject_active_agentic_chat_input_artifact_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
	v_status text;
	v_terminal_at timestamptz;
BEGIN
	SELECT
		turns.status,
		COALESCE(turns.terminalized_at, turns.finished_at)
	INTO
		v_status,
		v_terminal_at
	FROM public.chat_turn_runs turns
	WHERE turns.id = OLD.turn_run_id;

	IF NOT FOUND OR v_status IN ('queued', 'running') THEN
		RAISE EXCEPTION 'agentic_chat_active_input_artifact_cannot_be_deleted';
	END IF;
	IF v_status NOT IN ('completed', 'failed', 'cancelled') OR v_terminal_at IS NULL THEN
		RAISE EXCEPTION 'agentic_chat_input_artifact_terminal_turn_required';
	END IF;
	IF clock_timestamp() < GREATEST(OLD.retain_until, v_terminal_at + interval '7 days') THEN
		RAISE EXCEPTION 'agentic_chat_input_artifact_retention_not_elapsed';
	END IF;

	RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_active_agentic_chat_input_artifact_delete()
	FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_events_retention ON public.chat_turn_events;
CREATE TRIGGER trg_chat_turn_events_retention
BEFORE DELETE ON public.chat_turn_events
FOR EACH ROW EXECUTE FUNCTION public.enforce_agentic_chat_control_row_retention();

CREATE INDEX IF NOT EXISTS idx_chat_turn_runs_worker_terminal_retention
	ON public.chat_turn_runs (terminalized_at, id)
	WHERE execution_mode = 'worker_realtime'
		AND status IN ('completed', 'failed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_chat_turn_effects_uncertain_reconciled_retention
	ON public.chat_turn_effects (uncertain_reconciled_at, turn_run_id)
	WHERE uncertain_reconciled_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cleanup_agentic_chat_worker_artifacts(
	p_terminal_retention_days integer DEFAULT 7,
	p_effect_retention_days integer DEFAULT 30,
	p_uncertain_effect_retention_days integer DEFAULT 90,
	p_batch_size integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_terminal_retention_days integer := GREATEST(
		COALESCE(p_terminal_retention_days, 7),
		7
	);
	v_effect_retention_days integer := GREATEST(
		COALESCE(p_effect_retention_days, 30),
		30
	);
	v_uncertain_effect_retention_days integer := GREATEST(
		COALESCE(p_uncertain_effect_retention_days, 90),
		90,
		v_effect_retention_days
	);
	v_batch_size integer := GREATEST(LEAST(COALESCE(p_batch_size, 1000), 10000), 1);
	v_events_deleted integer := 0;
	v_stream_states_deleted integer := 0;
	v_signals_deleted integer := 0;
	v_input_artifacts_deleted integer := 0;
	v_effects_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT events.id
		FROM public.chat_turn_events events
		JOIN public.chat_turn_runs turns ON turns.id = events.turn_run_id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND turns.terminalized_at <= clock_timestamp()
				- make_interval(days => v_terminal_retention_days)
		ORDER BY turns.terminalized_at, events.created_at, events.id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_events events
	WHERE events.id IN (SELECT id FROM candidates);
	GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

	WITH candidates AS (
		SELECT streams.turn_run_id
		FROM public.chat_turn_stream_state streams
		JOIN public.chat_turn_runs turns ON turns.id = streams.turn_run_id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND turns.terminalized_at <= clock_timestamp()
				- make_interval(days => v_terminal_retention_days)
		ORDER BY turns.terminalized_at, streams.turn_run_id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_stream_state streams
	WHERE streams.turn_run_id IN (SELECT turn_run_id FROM candidates);
	GET DIAGNOSTICS v_stream_states_deleted = ROW_COUNT;

	WITH candidates AS (
		SELECT signals.id
		FROM public.chat_turn_signals signals
		JOIN public.chat_turn_runs turns ON turns.id = signals.turn_run_id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND turns.terminalized_at <= clock_timestamp()
				- make_interval(days => v_terminal_retention_days)
		ORDER BY turns.terminalized_at, signals.created_at, signals.id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_signals signals
	WHERE signals.id IN (SELECT id FROM candidates);
	GET DIAGNOSTICS v_signals_deleted = ROW_COUNT;

	WITH candidates AS (
		SELECT artifacts.id
		FROM public.chat_turn_input_artifacts artifacts
		JOIN public.chat_turn_runs turns ON turns.id = artifacts.turn_run_id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND turns.terminalized_at <= clock_timestamp()
				- make_interval(days => v_terminal_retention_days)
			AND artifacts.retain_until <= clock_timestamp()
		ORDER BY GREATEST(turns.terminalized_at, artifacts.retain_until), artifacts.id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_input_artifacts artifacts
	WHERE artifacts.id IN (SELECT id FROM candidates);
	GET DIAGNOSTICS v_input_artifacts_deleted = ROW_COUNT;

	WITH candidates AS (
		SELECT effects.id
		FROM public.chat_turn_effects effects
		JOIN public.chat_turn_runs turns ON turns.id = effects.turn_run_id
		WHERE turns.execution_mode = 'worker_realtime'
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND (
				(
					effects.uncertain_reconciled_at IS NULL
					AND effects.state IN ('reserved', 'succeeded', 'failed', 'cancelled')
					AND GREATEST(
						turns.terminalized_at,
						COALESCE(effects.finished_at, effects.updated_at, effects.created_at)
					) <= clock_timestamp() - make_interval(days => v_effect_retention_days)
				)
				OR (
					effects.uncertain_reconciled_at IS NOT NULL
					AND effects.state IN ('succeeded', 'failed')
					AND GREATEST(
						turns.terminalized_at,
						effects.uncertain_reconciled_at
					) <= clock_timestamp()
						- make_interval(days => v_uncertain_effect_retention_days)
				)
			)
		ORDER BY
			COALESCE(effects.uncertain_reconciled_at, effects.updated_at),
			effects.id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_effects effects
	WHERE effects.id IN (SELECT id FROM candidates);
	GET DIAGNOSTICS v_effects_deleted = ROW_COUNT;

	RETURN jsonb_build_object(
		'turn_events_deleted', v_events_deleted,
		'stream_states_deleted', v_stream_states_deleted,
		'turn_signals_deleted', v_signals_deleted,
		'input_artifacts_deleted', v_input_artifacts_deleted,
		'effects_deleted', v_effects_deleted,
		'terminal_retention_days', v_terminal_retention_days,
		'effect_retention_days', v_effect_retention_days,
		'uncertain_effect_retention_days', v_uncertain_effect_retention_days,
		'batch_size', v_batch_size
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_agentic_chat_worker_artifacts(
	integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_agentic_chat_worker_artifacts(
	integer, integer, integer, integer
) TO service_role;

COMMENT ON FUNCTION public.cleanup_agentic_chat_worker_artifacts(
	integer, integer, integer, integer
) IS
	'Bounded service-only cleanup for terminal worker stream/event/signal/input artifacts and resolved effects. Active turns plus unresolved started/uncertain effects are never eligible.';

COMMIT;
