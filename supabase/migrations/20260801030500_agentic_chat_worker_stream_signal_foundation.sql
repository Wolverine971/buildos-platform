-- supabase/migrations/20260801030500_agentic_chat_worker_stream_signal_foundation.sql
-- Agentic Chat Worker migration, Phase 2A Slice 4: stream/signal foundation.
--
-- This package adds durable, server-only storage for one current-generation
-- stream projection and one append-only cancellation signal per turn. It does
-- not add worker admission, claim/write/finalize/cancel RPCs, Realtime policy,
-- a queue consumer, or any executable asynchronous model path.
--
-- Rollback while worker routing remains disabled:
--   1. Drop trg_chat_turn_stream_state_validate/retention and
--      trg_chat_turn_signals_validate/retention with their tables.
--   2. Drop validate_agentic_chat_stream_state_write(),
--      validate_agentic_chat_signal_write(), and
--      enforce_agentic_chat_control_row_retention().

CREATE TABLE public.chat_turn_stream_state (
	turn_run_id uuid PRIMARY KEY,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	execution_generation integer NOT NULL DEFAULT 0,
	snapshot_sequence integer NOT NULL DEFAULT 0,
	durable_through_sequence integer NOT NULL DEFAULT 0,
	projection_durable_sequence integer NOT NULL DEFAULT 0,
	assistant_text text NOT NULL DEFAULT '',
	projection jsonb NOT NULL DEFAULT '{}'::jsonb,
	reconcile_required boolean NOT NULL DEFAULT false,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),

	CONSTRAINT fk_chat_turn_stream_state_turn_scope
		FOREIGN KEY (turn_run_id, session_id, user_id)
		REFERENCES public.chat_turn_runs(id, session_id, user_id)
		ON DELETE RESTRICT,
	CONSTRAINT chk_chat_turn_stream_state_generation
		CHECK (execution_generation >= 0),
	CONSTRAINT chk_chat_turn_stream_state_sequences
		CHECK (
			projection_durable_sequence >= 0
			AND projection_durable_sequence <= durable_through_sequence
			AND durable_through_sequence <= snapshot_sequence
		),
	CONSTRAINT chk_chat_turn_stream_state_projection
		CHECK (jsonb_typeof(projection) = 'object'),
	CONSTRAINT chk_chat_turn_stream_state_text_bound
		CHECK (octet_length(assistant_text) <= 2097152),
	CONSTRAINT chk_chat_turn_stream_state_timestamps
		CHECK (updated_at >= created_at)
);

COMMENT ON TABLE public.chat_turn_stream_state IS
	'Server-written, one-row-per-turn current-generation assistant text and UI projection used for lossless reconciliation. Not a semantic supervisor checkpoint.';
COMMENT ON COLUMN public.chat_turn_stream_state.assistant_text IS
	'Complete UTF-8 assistant-text prefix for the current execution generation, bounded at the locked 2 MiB supported-output limit.';
COMMENT ON COLUMN public.chat_turn_stream_state.projection IS
	'Complete current UI projection, including semantic history already reflected through projection_durable_sequence.';
COMMENT ON COLUMN public.chat_turn_stream_state.reconcile_required IS
	'Set when live delivery is degraded; clearing is reserved for the later fenced writer after backlog flush and a successful Broadcast.';

CREATE INDEX idx_chat_turn_stream_state_session_updated
	ON public.chat_turn_stream_state (user_id, session_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_stream_state_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_session_id uuid;
	v_user_id uuid;
	v_execution_generation integer;
BEGIN
	SELECT
		turns.session_id,
		turns.user_id,
		turns.execution_generation
	INTO
		v_session_id,
		v_user_id,
		v_execution_generation
	FROM public.chat_turn_runs turns
	WHERE turns.id = NEW.turn_run_id;

	IF NOT FOUND
		OR NEW.session_id IS DISTINCT FROM v_session_id
		OR NEW.user_id IS DISTINCT FROM v_user_id THEN
		RAISE EXCEPTION 'agentic_chat_stream_state_scope_mismatch';
	END IF;

	IF NEW.execution_generation IS DISTINCT FROM v_execution_generation THEN
		RAISE EXCEPTION 'agentic_chat_stream_state_generation_mismatch';
	END IF;

	IF TG_OP = 'UPDATE' THEN
		IF NEW.turn_run_id IS DISTINCT FROM OLD.turn_run_id
			OR NEW.session_id IS DISTINCT FROM OLD.session_id
			OR NEW.user_id IS DISTINCT FROM OLD.user_id
			OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
			RAISE EXCEPTION 'agentic_chat_stream_state_identity_is_immutable';
		END IF;

		IF NEW.execution_generation = OLD.execution_generation THEN
			IF NEW.snapshot_sequence < OLD.snapshot_sequence
				OR NEW.durable_through_sequence < OLD.durable_through_sequence
				OR NEW.projection_durable_sequence < OLD.projection_durable_sequence THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_sequence_regression';
			END IF;

			IF left(NEW.assistant_text, char_length(OLD.assistant_text))
				IS DISTINCT FROM OLD.assistant_text THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_prefix_regression';
			END IF;
		ELSIF NEW.execution_generation = OLD.execution_generation + 1 THEN
			IF NEW.snapshot_sequence <> 0
				OR NEW.durable_through_sequence <> 0
				OR NEW.projection_durable_sequence <> 0
				OR NEW.assistant_text <> ''
				OR NEW.reconcile_required THEN
				RAISE EXCEPTION 'agentic_chat_stream_state_generation_reset_required';
			END IF;
		ELSE
			RAISE EXCEPTION 'agentic_chat_stream_state_generation_transition_invalid';
		END IF;
	END IF;

	NEW.updated_at := GREATEST(clock_timestamp(), NEW.created_at);
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_stream_state_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_stream_state_write()
	FROM anon, authenticated;

CREATE TRIGGER trg_chat_turn_stream_state_validate
BEFORE INSERT OR UPDATE ON public.chat_turn_stream_state
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_stream_state_write();

CREATE TABLE public.chat_turn_signals (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	turn_run_id uuid NOT NULL UNIQUE,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	signal_version text NOT NULL DEFAULT 'agentic_chat_signal_v1',
	kind text NOT NULL DEFAULT 'cancel',
	reason text NOT NULL,
	source text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	consumed_at timestamptz,
	consumed_by_generation integer,

	CONSTRAINT fk_chat_turn_signals_turn_scope
		FOREIGN KEY (turn_run_id, session_id, user_id)
		REFERENCES public.chat_turn_runs(id, session_id, user_id)
		ON DELETE RESTRICT,
	CONSTRAINT chk_chat_turn_signals_version
		CHECK (signal_version = 'agentic_chat_signal_v1'),
	CONSTRAINT chk_chat_turn_signals_kind
		CHECK (kind = 'cancel'),
	CONSTRAINT chk_chat_turn_signals_reason
		CHECK (reason IN (
			'user_cancelled',
			'superseded',
			'timeout',
			'operator_cancelled'
		)),
	CONSTRAINT chk_chat_turn_signals_source
		CHECK (source IN ('browser', 'worker', 'operator', 'sweeper')),
	CONSTRAINT chk_chat_turn_signals_consumption
		CHECK (
			(consumed_at IS NULL AND consumed_by_generation IS NULL)
			OR (
				consumed_at IS NOT NULL
				AND consumed_at >= created_at
				AND consumed_by_generation IS NOT NULL
				AND consumed_by_generation >= 0
			)
		)
);

COMMENT ON TABLE public.chat_turn_signals IS
	'Server-written durable agentic-chat control signals. Cancellation content is append-only; the current generation may acknowledge consumption exactly once.';
COMMENT ON COLUMN public.chat_turn_signals.consumed_by_generation IS
	'Execution generation that consumed the signal. The acknowledgement trigger rejects stale generations and subsequent rewrites.';

CREATE INDEX idx_chat_turn_signals_unconsumed
	ON public.chat_turn_signals (turn_run_id)
	WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_signal_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_session_id uuid;
	v_user_id uuid;
	v_status text;
	v_cancel_requested_at timestamptz;
	v_cancel_reason text;
	v_execution_generation integer;
BEGIN
	SELECT
		turns.session_id,
		turns.user_id,
		turns.status,
		turns.cancel_requested_at,
		turns.cancel_reason,
		turns.execution_generation
	INTO
		v_session_id,
		v_user_id,
		v_status,
		v_cancel_requested_at,
		v_cancel_reason,
		v_execution_generation
	FROM public.chat_turn_runs turns
	WHERE turns.id = NEW.turn_run_id;

	IF NOT FOUND
		OR NEW.session_id IS DISTINCT FROM v_session_id
		OR NEW.user_id IS DISTINCT FROM v_user_id THEN
		RAISE EXCEPTION 'agentic_chat_signal_scope_mismatch';
	END IF;

	IF TG_OP = 'INSERT' THEN
		IF v_status <> 'running'
			OR v_cancel_requested_at IS NULL
			OR NEW.reason IS DISTINCT FROM v_cancel_reason THEN
			RAISE EXCEPTION 'agentic_chat_signal_without_matching_cancel_request';
		END IF;

		IF NEW.consumed_at IS NOT NULL OR NEW.consumed_by_generation IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_signal_must_start_unconsumed';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.turn_run_id IS DISTINCT FROM OLD.turn_run_id
		OR NEW.session_id IS DISTINCT FROM OLD.session_id
		OR NEW.user_id IS DISTINCT FROM OLD.user_id
		OR NEW.signal_version IS DISTINCT FROM OLD.signal_version
		OR NEW.kind IS DISTINCT FROM OLD.kind
		OR NEW.reason IS DISTINCT FROM OLD.reason
		OR NEW.source IS DISTINCT FROM OLD.source
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'agentic_chat_signal_content_is_immutable';
	END IF;

	IF OLD.consumed_at IS NULL AND OLD.consumed_by_generation IS NULL THEN
		IF NEW.consumed_at IS NULL AND NEW.consumed_by_generation IS NULL THEN
			RETURN NEW;
		END IF;

		IF NEW.consumed_at IS NULL OR NEW.consumed_by_generation IS NULL THEN
			RAISE EXCEPTION 'agentic_chat_signal_consumption_must_be_atomic';
		END IF;

		IF NEW.consumed_by_generation IS DISTINCT FROM v_execution_generation THEN
			RAISE EXCEPTION 'agentic_chat_signal_stale_generation';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.consumed_at IS DISTINCT FROM OLD.consumed_at
		OR NEW.consumed_by_generation IS DISTINCT FROM OLD.consumed_by_generation THEN
		RAISE EXCEPTION 'agentic_chat_signal_consumption_is_immutable';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_signal_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_signal_write()
	FROM anon, authenticated;

CREATE TRIGGER trg_chat_turn_signals_validate
BEFORE INSERT OR UPDATE ON public.chat_turn_signals
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_signal_write();

CREATE OR REPLACE FUNCTION public.enforce_agentic_chat_control_row_retention()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
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
		RAISE EXCEPTION 'agentic_chat_active_control_row_cannot_be_deleted';
	END IF;

	IF v_status NOT IN ('completed', 'failed', 'cancelled')
		OR v_terminal_at IS NULL
		OR clock_timestamp() < v_terminal_at + interval '7 days' THEN
		RAISE EXCEPTION 'agentic_chat_control_row_retention_not_elapsed';
	END IF;

	RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agentic_chat_control_row_retention() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_agentic_chat_control_row_retention()
	FROM anon, authenticated;

CREATE TRIGGER trg_chat_turn_stream_state_retention
BEFORE DELETE ON public.chat_turn_stream_state
FOR EACH ROW EXECUTE FUNCTION public.enforce_agentic_chat_control_row_retention();

CREATE TRIGGER trg_chat_turn_signals_retention
BEFORE DELETE ON public.chat_turn_signals
FOR EACH ROW EXECUTE FUNCTION public.enforce_agentic_chat_control_row_retention();

ALTER TABLE public.chat_turn_stream_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_turn_signals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_turn_stream_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.chat_turn_signals FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
	ON TABLE public.chat_turn_stream_state, public.chat_turn_signals
	TO service_role;

-- Exact schema rollback proof used by the disposable Phase 2A fixture:
--
-- DROP TABLE public.chat_turn_signals;
-- DROP TABLE public.chat_turn_stream_state;
-- DROP FUNCTION public.validate_agentic_chat_signal_write();
-- DROP FUNCTION public.validate_agentic_chat_stream_state_write();
-- DROP FUNCTION public.enforce_agentic_chat_control_row_retention();
