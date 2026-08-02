-- supabase/migrations/20260801041000_agentic_chat_worker_effect_foundation.sql
-- Agentic Chat Worker migration, Phase 2B Slice 1: mutation-effect foundation.
--
-- This additive slice creates the server-only effect ledger and the nullable
-- chat_tool_executions telemetry link. It deliberately creates no reservation,
-- begin, admission, claim, finalization, recovery, or worker execution RPC.

CREATE TABLE public.chat_turn_effects (
	id uuid PRIMARY KEY,
	turn_run_id uuid NOT NULL,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	execution_generation integer NOT NULL,
	tool_name text NOT NULL,
	operation_name text NOT NULL,
	canonical_argument_hash text NOT NULL,
	provider_tool_call_id text,
	state text NOT NULL DEFAULT 'reserved',
	downstream_idempotency_supported boolean NOT NULL,
	downstream_receipt jsonb,
	failure_code text,
	reserved_at timestamptz NOT NULL DEFAULT now(),
	started_at timestamptz,
	finished_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),

	CONSTRAINT uq_chat_turn_effects_id_turn UNIQUE (id, turn_run_id),
	CONSTRAINT fk_chat_turn_effects_turn_scope
		FOREIGN KEY (turn_run_id, session_id, user_id)
		REFERENCES public.chat_turn_runs(id, session_id, user_id)
		ON DELETE CASCADE,
	CONSTRAINT chk_chat_turn_effects_generation
		CHECK (execution_generation >= 1),
	CONSTRAINT chk_chat_turn_effects_names
		CHECK (
			btrim(tool_name) <> ''
			AND length(tool_name) <= 256
			AND btrim(operation_name) <> ''
			AND length(operation_name) <= 256
			AND (provider_tool_call_id IS NULL OR length(provider_tool_call_id) <= 512)
		),
	CONSTRAINT chk_chat_turn_effects_argument_hash
		CHECK (canonical_argument_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT chk_chat_turn_effects_state
		CHECK (
			state IN ('reserved', 'started', 'succeeded', 'failed', 'cancelled', 'uncertain')
		),
	CONSTRAINT chk_chat_turn_effects_timeline
		CHECK (
			(
				state = 'reserved'
				AND started_at IS NULL
				AND finished_at IS NULL
				AND downstream_receipt IS NULL
			)
			OR (
				state = 'started'
				AND started_at IS NOT NULL
				AND finished_at IS NULL
				AND downstream_receipt IS NULL
			)
			OR (
				state = 'cancelled'
				AND started_at IS NULL
				AND finished_at IS NOT NULL
				AND downstream_receipt IS NULL
			)
			OR (
				state IN ('succeeded', 'failed', 'uncertain')
				AND started_at IS NOT NULL
				AND finished_at IS NOT NULL
			)
		),
	CONSTRAINT chk_chat_turn_effects_timestamp_order
		CHECK (
			reserved_at >= created_at
			AND (started_at IS NULL OR started_at >= reserved_at)
			AND (finished_at IS NULL OR finished_at >= COALESCE(started_at, reserved_at))
			AND updated_at >= created_at
		)
);

COMMENT ON TABLE public.chat_turn_effects IS
	'Server-only stable mutation-effect ledger. Phase 2B fenced RPCs will reserve and transition effects before any mutating adapter invocation.';
COMMENT ON COLUMN public.chat_turn_effects.id IS
	'Runtime-generated stable effect id. Provider tool-call ids are telemetry only and never provide idempotency.';
COMMENT ON COLUMN public.chat_turn_effects.canonical_argument_hash IS
	'Lowercase SHA-256 of the canonical mutating operation arguments; same effect id with a different hash is a hard conflict.';
COMMENT ON COLUMN public.chat_turn_effects.state IS
	'Effect lifecycle: reserved -> started -> succeeded/failed/uncertain, or reserved -> cancelled. Uncertain may later reconcile to succeeded/failed.';

CREATE INDEX idx_chat_turn_effects_turn_generation
	ON public.chat_turn_effects (turn_run_id, execution_generation, created_at);

CREATE INDEX idx_chat_turn_effects_state_updated
	ON public.chat_turn_effects (state, updated_at);

CREATE OR REPLACE FUNCTION public.enforce_agentic_chat_effect_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF TG_OP = 'INSERT' THEN
		IF NEW.state <> 'reserved'
			OR NEW.started_at IS NOT NULL
			OR NEW.finished_at IS NOT NULL
			OR NEW.downstream_receipt IS NOT NULL THEN
			RAISE EXCEPTION 'agentic_chat_effect_must_start_reserved';
		END IF;
		RETURN NEW;
	END IF;

	IF NEW.id IS DISTINCT FROM OLD.id
		OR NEW.turn_run_id IS DISTINCT FROM OLD.turn_run_id
		OR NEW.session_id IS DISTINCT FROM OLD.session_id
		OR NEW.user_id IS DISTINCT FROM OLD.user_id
		OR NEW.execution_generation IS DISTINCT FROM OLD.execution_generation
		OR NEW.tool_name IS DISTINCT FROM OLD.tool_name
		OR NEW.operation_name IS DISTINCT FROM OLD.operation_name
		OR NEW.canonical_argument_hash IS DISTINCT FROM OLD.canonical_argument_hash
		OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
		OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
		RAISE EXCEPTION 'agentic_chat_effect_identity_is_immutable';
	END IF;

	IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at THEN
		RAISE EXCEPTION 'agentic_chat_effect_started_at_is_immutable';
	END IF;

	IF OLD.finished_at IS NOT NULL AND NEW.finished_at IS DISTINCT FROM OLD.finished_at THEN
		RAISE EXCEPTION 'agentic_chat_effect_finished_at_is_immutable';
	END IF;

	IF OLD.state IN ('succeeded', 'failed', 'cancelled') THEN
		RAISE EXCEPTION 'agentic_chat_effect_terminal_is_immutable';
	END IF;

	IF NOT (
		(OLD.state = 'reserved' AND NEW.state IN ('reserved', 'started', 'cancelled'))
		OR (OLD.state = 'started' AND NEW.state IN ('started', 'succeeded', 'failed', 'uncertain'))
		OR (OLD.state = 'uncertain' AND NEW.state IN ('uncertain', 'succeeded', 'failed'))
	) THEN
		RAISE EXCEPTION 'agentic_chat_effect_invalid_transition:%->%', OLD.state, NEW.state;
	END IF;

	NEW.updated_at := now();
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_agentic_chat_effect_transition() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_agentic_chat_effect_transition() FROM anon, authenticated;

CREATE TRIGGER trg_chat_turn_effects_transition
BEFORE INSERT OR UPDATE ON public.chat_turn_effects
FOR EACH ROW EXECUTE FUNCTION public.enforce_agentic_chat_effect_transition();

CREATE OR REPLACE FUNCTION public.reject_protected_agentic_chat_effect_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF OLD.state = 'uncertain' THEN
		RAISE EXCEPTION 'agentic_chat_uncertain_effect_cannot_be_deleted';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_runs turns
		WHERE turns.id = OLD.turn_run_id
			AND turns.status IN ('queued', 'running')
	) THEN
		RAISE EXCEPTION 'agentic_chat_active_effect_cannot_be_deleted';
	END IF;

	RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_protected_agentic_chat_effect_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_protected_agentic_chat_effect_delete() FROM anon, authenticated;

CREATE TRIGGER trg_chat_turn_effects_protected_delete
BEFORE DELETE ON public.chat_turn_effects
FOR EACH ROW EXECUTE FUNCTION public.reject_protected_agentic_chat_effect_delete();

ALTER TABLE public.chat_tool_executions
	ADD COLUMN effect_id uuid REFERENCES public.chat_turn_effects(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_tool_effect_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF NEW.effect_id IS NOT NULL
		AND (
			NEW.turn_run_id IS NULL
			OR NOT EXISTS (
				SELECT 1
				FROM public.chat_turn_effects effects
				WHERE effects.id = NEW.effect_id
					AND effects.turn_run_id = NEW.turn_run_id
			)
		) THEN
		RAISE EXCEPTION 'agentic_chat_tool_effect_scope_mismatch';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_tool_effect_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_tool_effect_scope() FROM anon, authenticated;

CREATE TRIGGER trg_chat_tool_executions_effect_scope
BEFORE INSERT OR UPDATE OF effect_id, turn_run_id ON public.chat_tool_executions
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_tool_effect_scope();

ALTER TABLE public.chat_turn_effects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_turn_effects FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_turn_effects TO service_role;

-- Rollback while the worker path remains disabled:
--   DROP TRIGGER trg_chat_tool_executions_effect_scope ON public.chat_tool_executions;
--   DROP FUNCTION public.validate_agentic_chat_tool_effect_scope();
--   ALTER TABLE public.chat_tool_executions DROP COLUMN effect_id;
--   DROP TABLE public.chat_turn_effects;
--   DROP FUNCTION public.enforce_agentic_chat_effect_transition();
--   DROP FUNCTION public.reject_protected_agentic_chat_effect_delete();
