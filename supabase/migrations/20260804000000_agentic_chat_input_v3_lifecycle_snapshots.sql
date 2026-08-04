-- supabase/migrations/20260804000000_agentic_chat_input_v3_lifecycle_snapshots.sql
-- Agentic Chat Worker Phase 4 Slice 4: immutable pre-provider snapshots.
--
-- The atomic admission RPC intentionally keeps its existing signature for a
-- rolling deployment. New web code includes both lifecycle snapshots inside
-- the already-hashed prepared JSON. This insert trigger recognizes and
-- validates that exact shape, then upgrades only that row to input v3. Older
-- web code continues producing valid v2 artifacts until it is replaced.

BEGIN;

ALTER TABLE public.chat_turn_input_artifacts
	DROP CONSTRAINT chk_chat_turn_input_artifacts_version;

ALTER TABLE public.chat_turn_input_artifacts
	ADD CONSTRAINT chk_chat_turn_input_artifacts_version
	CHECK (artifact_version IN ('agentic_chat_input_v2', 'agentic_chat_input_v3'));

CREATE OR REPLACE FUNCTION public.validate_agentic_chat_input_artifact_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
	v_session_snapshot jsonb := NEW.prepared->'sessionSnapshot';
	v_context_usage jsonb := NEW.prepared->'contextUsageSnapshot';
	v_has_session boolean := NEW.prepared ? 'sessionSnapshot';
	v_has_context_usage boolean := NEW.prepared ? 'contextUsageSnapshot';
BEGIN
	IF v_has_session OR v_has_context_usage THEN
		IF NOT v_has_session OR NOT v_has_context_usage
			OR COALESCE(jsonb_typeof(v_session_snapshot) <> 'object', true)
			OR v_session_snapshot ? 'id'
			OR COALESCE(jsonb_typeof(v_context_usage) <> 'object', true) THEN
			RAISE EXCEPTION 'agentic_chat_input_v3_invalid_lifecycle_snapshot';
		END IF;
		IF COALESCE((v_context_usage->>'estimatedTokens') !~ '^[0-9]+$', true)
			OR COALESCE((v_context_usage->>'tokenBudget') !~ '^[0-9]+$', true)
			OR COALESCE((v_context_usage->>'usagePercent') !~ '^[0-9]+$', true)
			OR COALESCE((v_context_usage->>'tokensRemaining') !~ '^[0-9]+$', true)
			OR COALESCE(
				v_context_usage->>'status' NOT IN ('ok', 'near_limit', 'over_budget'),
				true
			) THEN
			RAISE EXCEPTION 'agentic_chat_input_v3_invalid_lifecycle_snapshot';
		END IF;
		IF (v_context_usage->>'estimatedTokens')::numeric < 0
			OR (v_context_usage->>'estimatedTokens')::numeric > 9007199254740991
			OR (v_context_usage->>'tokenBudget')::numeric <= 0
			OR (v_context_usage->>'tokenBudget')::numeric > 9007199254740991
			OR (v_context_usage->>'usagePercent')::numeric > 999
			OR (v_context_usage->>'tokensRemaining')::numeric < 0
			OR (v_context_usage->>'tokensRemaining')::numeric > 9007199254740991 THEN
			RAISE EXCEPTION 'agentic_chat_input_v3_invalid_lifecycle_snapshot';
		END IF;
		NEW.artifact_version := 'agentic_chat_input_v3';
	ELSIF NEW.artifact_version = 'agentic_chat_input_v3' THEN
		RAISE EXCEPTION 'agentic_chat_input_v3_missing_lifecycle_snapshot';
	END IF;

	RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_agentic_chat_input_artifact_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_agentic_chat_input_artifact_version()
	FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_turn_input_artifacts_version
	ON public.chat_turn_input_artifacts;
CREATE TRIGGER trg_chat_turn_input_artifacts_version
BEFORE INSERT ON public.chat_turn_input_artifacts
FOR EACH ROW EXECUTE FUNCTION public.validate_agentic_chat_input_artifact_version();

COMMENT ON FUNCTION public.validate_agentic_chat_input_artifact_version() IS
	'Upgrades snapshot-bearing immutable inputs to agentic_chat_input_v3 while preserving rolling v2 admission compatibility.';

COMMIT;
