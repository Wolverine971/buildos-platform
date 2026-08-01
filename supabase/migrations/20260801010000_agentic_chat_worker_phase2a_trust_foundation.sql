-- Agentic Chat Worker migration, Phase 2A Slice 1: trust/schema foundation.
--
-- Deploy order:
--   1. Phase 1 server-owned legacy/prewarm writers are already deployed.
--   2. Apply this legacy-compatible schema and permission boundary.
--   3. Regenerate database types and deploy dual-compatible application code.
--
-- Rollback:
--   - Keep the additive columns/table in place while either application version may run.
--   - If the Phase 1 server-writer deployment itself must be rolled back, restore only
--     the named authenticated policies/grants removed at the bottom of this file.
--
-- This slice deliberately adds no queued status, queue enum value/job, worker admission,
-- claim/finalize RPC, Realtime policy, transport route, or worker execution path.

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_runs
		WHERE execution_mode NOT IN ('legacy_sse', 'worker_realtime')
	) THEN
		RAISE EXCEPTION
			'agentic_chat_phase2a_preflight_failed: unsupported execution_mode exists';
	END IF;
END;
$$;

ALTER TABLE public.chat_turn_runs
	ADD COLUMN IF NOT EXISTS request_payload jsonb,
	ADD COLUMN IF NOT EXISTS request_payload_version text,
	ADD COLUMN IF NOT EXISTS transport_contract_version text,
	ADD COLUMN IF NOT EXISTS transport_decision_id uuid,
	ADD COLUMN IF NOT EXISTS queue_job_id uuid REFERENCES public.queue_jobs(id) ON DELETE SET NULL,
	ADD COLUMN IF NOT EXISTS correlation_id uuid,
	ADD COLUMN IF NOT EXISTS execution_generation integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
	ADD COLUMN IF NOT EXISTS cancel_reason text,
	ADD COLUMN IF NOT EXISTS worker_started_at timestamptz,
	ADD COLUMN IF NOT EXISTS execution_started_at timestamptz,
	ADD COLUMN IF NOT EXISTS mutation_reserved_at timestamptz,
	ADD COLUMN IF NOT EXISTS irreversible_boundary_at timestamptz,
	ADD COLUMN IF NOT EXISTS history_cutoff_at timestamptz,
	ADD COLUMN IF NOT EXISTS history_message_ids uuid[],
	ADD COLUMN IF NOT EXISTS stale_context_policy text,
	ADD COLUMN IF NOT EXISTS last_event_sequence integer NOT NULL DEFAULT 0,
	ADD COLUMN IF NOT EXISTS terminal_event_id text,
	ADD COLUMN IF NOT EXISTS terminalized_at timestamptz,
	ADD COLUMN IF NOT EXISTS failure_code text;

UPDATE public.chat_turn_runs
SET
	request_payload = COALESCE(request_payload, '{}'::jsonb),
	request_payload_version = COALESCE(request_payload_version, 'legacy_v1'),
	correlation_id = COALESCE(correlation_id, gen_random_uuid())
WHERE request_payload IS NULL
	OR request_payload_version IS NULL
	OR correlation_id IS NULL;

ALTER TABLE public.chat_turn_runs
	ALTER COLUMN request_payload SET DEFAULT '{}'::jsonb,
	ALTER COLUMN request_payload SET NOT NULL,
	ALTER COLUMN request_payload_version SET DEFAULT 'legacy_v1',
	ALTER COLUMN request_payload_version SET NOT NULL,
	ALTER COLUMN correlation_id SET DEFAULT gen_random_uuid(),
	ALTER COLUMN correlation_id SET NOT NULL;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.chat_turn_runs'::regclass
			AND conname = 'chk_chat_turn_runs_request_payload_object'
	) THEN
		ALTER TABLE public.chat_turn_runs
			ADD CONSTRAINT chk_chat_turn_runs_request_payload_object
			CHECK (jsonb_typeof(request_payload) = 'object');
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.chat_turn_runs'::regclass
			AND conname = 'chk_chat_turn_runs_execution_mode'
	) THEN
		ALTER TABLE public.chat_turn_runs
			ADD CONSTRAINT chk_chat_turn_runs_execution_mode
			CHECK (execution_mode IN ('legacy_sse', 'worker_realtime'));
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.chat_turn_runs'::regclass
			AND conname = 'chk_chat_turn_runs_worker_counters'
	) THEN
		ALTER TABLE public.chat_turn_runs
			ADD CONSTRAINT chk_chat_turn_runs_worker_counters
			CHECK (execution_generation >= 0 AND last_event_sequence >= 0);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.chat_turn_runs'::regclass
			AND conname = 'chk_chat_turn_runs_history_lineage_bound'
	) THEN
		ALTER TABLE public.chat_turn_runs
			ADD CONSTRAINT chk_chat_turn_runs_history_lineage_bound
			CHECK (history_message_ids IS NULL OR cardinality(history_message_ids) <= 50);
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.chat_turn_runs'::regclass
			AND conname = 'chk_chat_turn_runs_stale_context_policy'
	) THEN
		ALTER TABLE public.chat_turn_runs
			ADD CONSTRAINT chk_chat_turn_runs_stale_context_policy
			CHECK (
				stale_context_policy IS NULL
				OR stale_context_policy = 'fail_after_max_queue_residence'
			);
	END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_turn_runs_transport_decision
	ON public.chat_turn_runs (transport_decision_id)
	WHERE transport_decision_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_turn_runs_terminal_event
	ON public.chat_turn_runs (terminal_event_id)
	WHERE terminal_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_turn_runs_identity_scope
	ON public.chat_turn_runs (id, session_id, user_id);

CREATE OR REPLACE FUNCTION public.reject_agentic_chat_execution_mode_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF NEW.execution_mode IS DISTINCT FROM OLD.execution_mode THEN
		RAISE EXCEPTION 'agentic_chat_execution_mode_is_immutable';
	END IF;
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_agentic_chat_execution_mode_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_agentic_chat_execution_mode_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_runs_execution_mode_immutable ON public.chat_turn_runs;
CREATE TRIGGER trg_chat_turn_runs_execution_mode_immutable
BEFORE UPDATE OF execution_mode ON public.chat_turn_runs
FOR EACH ROW EXECUTE FUNCTION public.reject_agentic_chat_execution_mode_change();

CREATE TABLE IF NOT EXISTS public.chat_turn_input_artifacts (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	turn_run_id uuid NOT NULL UNIQUE,
	session_id uuid NOT NULL,
	user_id uuid NOT NULL,
	source_prepared_prompt_id uuid,
	artifact_version text NOT NULL,
	history_source text NOT NULL,
	history jsonb NOT NULL,
	prepared jsonb NOT NULL,
	content_hash text NOT NULL,
	history_bytes integer NOT NULL,
	content_bytes integer NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	retain_until timestamptz NOT NULL DEFAULT (now() + interval '7 days'),

	CONSTRAINT uq_chat_turn_input_artifacts_id_turn UNIQUE (id, turn_run_id),
	CONSTRAINT fk_chat_turn_input_artifacts_turn_scope
		FOREIGN KEY (turn_run_id, session_id, user_id)
		REFERENCES public.chat_turn_runs(id, session_id, user_id)
		ON DELETE CASCADE,
	CONSTRAINT chk_chat_turn_input_artifacts_version
		CHECK (artifact_version = 'agentic_chat_input_v2'),
	CONSTRAINT chk_chat_turn_input_artifacts_history_source
		CHECK (history_source IN ('admission_window', 'prepared_prompt')),
	CONSTRAINT chk_chat_turn_input_artifacts_history_array
		CHECK (jsonb_typeof(history) = 'array'),
	CONSTRAINT chk_chat_turn_input_artifacts_prepared_object
		CHECK (jsonb_typeof(prepared) = 'object'),
	CONSTRAINT chk_chat_turn_input_artifacts_hash
		CHECK (content_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT chk_chat_turn_input_artifacts_content_bound
		CHECK (
			history_bytes >= 0
			AND history_bytes <= 262144
			AND content_bytes > 0
			AND content_bytes <= 2097152
			AND history_bytes <= content_bytes
			-- Coarse storage guard; the shared canonical verifier proves the exact
			-- UTF-8 byte counts before execution.
			AND octet_length(history::text) + octet_length(prepared::text) <= 4194304
		),
	CONSTRAINT chk_chat_turn_input_artifacts_retention
		CHECK (retain_until >= created_at + interval '7 days')
);

COMMENT ON TABLE public.chat_turn_input_artifacts IS
	'Server-written immutable agentic-chat execution inputs. Worker execution verifies version, canonical content hash, byte limits, and turn scope before provider work.';
COMMENT ON COLUMN public.chat_turn_input_artifacts.source_prepared_prompt_id IS
	'Lineage only. No foreign key: ordinary prepared-prompt cleanup must not mutate or delete the frozen artifact.';
COMMENT ON COLUMN public.chat_turn_input_artifacts.content_hash IS
	'Gateway-computed SHA-256 of the canonical artifact body excluding hash and retention timestamps.';
COMMENT ON COLUMN public.chat_turn_input_artifacts.history_bytes IS
	'Canonical UTF-8 history byte count from the shared verifier; worker execution recomputes and compares it.';
COMMENT ON COLUMN public.chat_turn_input_artifacts.content_bytes IS
	'Canonical UTF-8 artifact-content byte count from the shared verifier; worker execution recomputes and compares it.';

CREATE INDEX IF NOT EXISTS idx_chat_turn_input_artifacts_retention
	ON public.chat_turn_input_artifacts (retain_until, turn_run_id);

CREATE INDEX IF NOT EXISTS idx_chat_turn_input_artifacts_user_created
	ON public.chat_turn_input_artifacts (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.reject_agentic_chat_input_artifact_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	RAISE EXCEPTION 'agentic_chat_input_artifact_is_immutable';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_agentic_chat_input_artifact_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_agentic_chat_input_artifact_update() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_input_artifacts_immutable
	ON public.chat_turn_input_artifacts;
CREATE TRIGGER trg_chat_turn_input_artifacts_immutable
BEFORE UPDATE ON public.chat_turn_input_artifacts
FOR EACH ROW EXECUTE FUNCTION public.reject_agentic_chat_input_artifact_update();

CREATE OR REPLACE FUNCTION public.reject_active_agentic_chat_input_artifact_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM public.chat_turn_runs
		WHERE id = OLD.turn_run_id
			AND status IN ('queued', 'running')
	) THEN
		RAISE EXCEPTION 'agentic_chat_active_input_artifact_cannot_be_deleted';
	END IF;
	RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_active_agentic_chat_input_artifact_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_active_agentic_chat_input_artifact_delete() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_input_artifacts_active_retention
	ON public.chat_turn_input_artifacts;
CREATE TRIGGER trg_chat_turn_input_artifacts_active_retention
BEFORE DELETE ON public.chat_turn_input_artifacts
FOR EACH ROW EXECUTE FUNCTION public.reject_active_agentic_chat_input_artifact_delete();

ALTER TABLE public.chat_turn_runs
	ADD COLUMN IF NOT EXISTS input_artifact_id uuid;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.chat_turn_runs'::regclass
			AND conname = 'fk_chat_turn_runs_input_artifact'
	) THEN
		ALTER TABLE public.chat_turn_runs
			ADD CONSTRAINT fk_chat_turn_runs_input_artifact
			FOREIGN KEY (input_artifact_id)
			REFERENCES public.chat_turn_input_artifacts(id)
			ON DELETE SET NULL;
	END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_input_artifact_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
	IF NEW.input_artifact_id IS NOT NULL
		AND NOT EXISTS (
			SELECT 1
			FROM public.chat_turn_input_artifacts artifact
			WHERE artifact.id = NEW.input_artifact_id
				AND artifact.turn_run_id = NEW.id
				AND artifact.session_id = NEW.session_id
				AND artifact.user_id = NEW.user_id
		) THEN
		RAISE EXCEPTION 'agentic_chat_input_artifact_scope_mismatch';
	END IF;
	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_input_artifact_link() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_input_artifact_link() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_runs_input_artifact_scope ON public.chat_turn_runs;
CREATE CONSTRAINT TRIGGER trg_chat_turn_runs_input_artifact_scope
AFTER INSERT OR UPDATE ON public.chat_turn_runs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_input_artifact_link();

ALTER TABLE public.chat_turn_input_artifacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_turn_input_artifacts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.chat_turn_input_artifacts TO service_role;

-- Phase 1 moved every live writer below behind a service-owned boundary. Remove
-- the old authenticated write policies and grants before worker execution exists.
DROP POLICY IF EXISTS "chat_turn_runs_user_insert" ON public.chat_turn_runs;
DROP POLICY IF EXISTS "chat_turn_runs_user_update" ON public.chat_turn_runs;
DROP POLICY IF EXISTS "chat_turn_events_user_insert" ON public.chat_turn_events;
DROP POLICY IF EXISTS "chat_turn_checkpoints_user_insert" ON public.chat_turn_checkpoints;
DROP POLICY IF EXISTS "chat_turn_checkpoints_user_update" ON public.chat_turn_checkpoints;
DROP POLICY IF EXISTS "chat_prompt_snapshots_user_insert" ON public.chat_prompt_snapshots;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.chat_turn_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.chat_turn_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.chat_turn_checkpoints FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.chat_prompt_snapshots FROM anon, authenticated;

-- Prepared prompt content is server-only. Bounded client metadata continues to
-- flow through the authenticated web API introduced in Phase 1.
DROP POLICY IF EXISTS "prepared_prompts_user_insert"
	ON public.agentic_chat_prepared_prompts;
DROP POLICY IF EXISTS "prepared_prompts_user_select"
	ON public.agentic_chat_prepared_prompts;
DROP POLICY IF EXISTS "prepared_prompts_user_update"
	ON public.agentic_chat_prepared_prompts;
DROP POLICY IF EXISTS "prepared_prompts_admin_select"
	ON public.agentic_chat_prepared_prompts;

REVOKE SELECT, INSERT, UPDATE, DELETE
	ON TABLE public.agentic_chat_prepared_prompts
	FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_agentic_chat_prepared_prompts()
	FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
	ON TABLE public.agentic_chat_prepared_prompts
	TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_agentic_chat_prepared_prompts()
	TO service_role;

-- Permission-boundary rollback only (use solely if Phase 1 server writers are
-- rolled back; leave all additive Phase 2A schema in place):
--
-- BEGIN;
-- GRANT INSERT, UPDATE ON public.chat_turn_runs TO authenticated;
-- GRANT INSERT ON public.chat_turn_events TO authenticated;
-- GRANT INSERT, UPDATE ON public.chat_turn_checkpoints TO authenticated;
-- GRANT INSERT ON public.chat_prompt_snapshots TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE
--   ON public.agentic_chat_prepared_prompts TO authenticated;
-- GRANT EXECUTE ON FUNCTION public.cleanup_expired_agentic_chat_prepared_prompts()
--   TO authenticated;
-- CREATE POLICY "chat_turn_runs_user_insert" ON public.chat_turn_runs
--   FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "chat_turn_runs_user_update" ON public.chat_turn_runs
--   FOR UPDATE TO authenticated USING (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "chat_turn_events_user_insert" ON public.chat_turn_events
--   FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "chat_turn_checkpoints_user_insert" ON public.chat_turn_checkpoints
--   FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "chat_turn_checkpoints_user_update" ON public.chat_turn_checkpoints
--   FOR UPDATE TO authenticated USING (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "chat_prompt_snapshots_user_insert" ON public.chat_prompt_snapshots
--   FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "prepared_prompts_user_insert" ON public.agentic_chat_prepared_prompts
--   FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "prepared_prompts_user_select" ON public.agentic_chat_prepared_prompts
--   FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- CREATE POLICY "prepared_prompts_user_update" ON public.agentic_chat_prepared_prompts
--   FOR UPDATE TO authenticated USING (auth.uid() = user_id)
--   WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "prepared_prompts_admin_select" ON public.agentic_chat_prepared_prompts
--   FOR SELECT TO authenticated USING (public.is_admin());
-- COMMIT;
