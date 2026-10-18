-- supabase/migrations/20261018150000_llm_call_incidents.sql
--
-- Model calls that stalled or failed, captured in full so they can be studied
-- later (DJ, 2026-10-18): the exact request body we sent (messages, tools,
-- routing), the model and provider, every response byte with its arrival time,
-- the error body, how the call ended, what it eventually returned when it was
-- left to finish in the background, and OpenRouter's own record of the
-- generation. Healthy calls write nothing.
--
-- Written by the agentic chat worker (provider/openrouter/call-capture.ts) off
-- the turn's critical path; other lanes can add rows with their own `lane`.
--
-- Privacy: rows hold prompts (workspace context, tool results), the same class
-- of data as chat_prompt_snapshots, and follow its 14-day window ("Saved AI
-- prompts: 14 days", docs/privacy/CLAIMS.md). They go with the chat, the turn,
-- or the account (ON DELETE CASCADE). Service role only: RLS on, no policies,
-- no anon/authenticated grants.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.llm_call_incidents (
	id uuid PRIMARY KEY,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	lane text NOT NULL CHECK (char_length(lane) BETWEEN 1 AND 80),
	user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
	session_id uuid REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
	turn_run_id uuid REFERENCES public.chat_turn_runs(id) ON DELETE CASCADE,
	project_id uuid,
	-- llm_usage_logs.id of the same physical request.
	usage_log_id uuid,
	kind text NOT NULL CHECK (kind IN ('stall', 'error')),
	reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 120),
	pass_role text,
	logical_provider_round integer,
	provider_attempt integer,
	route_id text,
	model_requested text NOT NULL,
	model_used text,
	provider text,
	http_status integer,
	-- OpenRouter generation id (gen-...), for GET /api/v1/generation.
	generation_id text,
	started_at timestamptz NOT NULL,
	ended_at timestamptz,
	duration_ms integer,
	-- Byte-for-byte what was sent. Credentials never are: the key travels in a header.
	request_body text NOT NULL,
	request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
	request_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
	response_headers jsonb,
	-- Raw SSE text or error body as received, up to the capture bound.
	response_body text,
	response_truncated boolean NOT NULL DEFAULT false,
	-- [{at_ms, event, ...}] plus byte arrival samples.
	timeline jsonb NOT NULL DEFAULT '{}'::jsonb,
	outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
	-- A stalled call left to finish in the background: how and when it ended.
	eventual jsonb,
	-- OpenRouter's record of the generation (provider, latency, tokens, cancelled).
	generation_stats jsonb,
	CONSTRAINT llm_call_incidents_request_size CHECK (octet_length(request_body) <= 4194304),
	CONSTRAINT llm_call_incidents_response_size CHECK (
		response_body IS NULL OR octet_length(response_body) <= 2097152
	),
	CONSTRAINT llm_call_incidents_json_shapes CHECK (
		jsonb_typeof(request_headers) = 'object'
		AND jsonb_typeof(timeline) = 'object'
		AND jsonb_typeof(outcome) = 'object'
		AND (response_headers IS NULL OR jsonb_typeof(response_headers) = 'object')
		AND (eventual IS NULL OR jsonb_typeof(eventual) = 'object')
		AND (generation_stats IS NULL OR jsonb_typeof(generation_stats) = 'object')
	)
);

CREATE INDEX IF NOT EXISTS idx_llm_call_incidents_created
	ON public.llm_call_incidents USING btree (created_at DESC);
-- Cascade deletes and per-turn lookups.
CREATE INDEX IF NOT EXISTS idx_llm_call_incidents_turn
	ON public.llm_call_incidents USING btree (turn_run_id) WHERE turn_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_call_incidents_session
	ON public.llm_call_incidents USING btree (session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_call_incidents_user
	ON public.llm_call_incidents USING btree (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.llm_call_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.llm_call_incidents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.llm_call_incidents TO service_role;

-- Project fold classifies every column that points at a project.
DO $fold$
BEGIN
	IF to_regclass('private.project_fold_table_policy') IS NOT NULL THEN
		INSERT INTO private.project_fold_table_policy (table_schema, table_name, column_name, action, reason)
		VALUES
			('public', 'llm_call_incidents', 'project_id', 'leave_behind',
				'Diagnostic history of one model call, kept 14 days; a fold does not move it.')
		ON CONFLICT DO NOTHING;
	END IF;
END
$fold$;

COMMENT ON TABLE public.llm_call_incidents IS
	'Stalled or failed model calls, captured in full for diagnosis. 14 days (cleanup_privacy_llm_call_incidents). Service role only.';

-- 14 days, like chat_prompt_snapshots. One bounded batch per call; the daily
-- privacy job (apps/worker/src/scheduler/privacyRetention.ts) calls it until a
-- batch deletes nothing.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_llm_call_incidents(
	p_batch_size integer DEFAULT 500
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
	v_batch_size integer := greatest(least(coalesce(p_batch_size, 500), 5000), 1);
	v_deleted integer := 0;
BEGIN
	WITH expired AS (
		SELECT id
		FROM public.llm_call_incidents
		WHERE created_at < now() - interval '14 days'
		ORDER BY created_at ASC
		LIMIT v_batch_size
	)
	DELETE FROM public.llm_call_incidents incidents
	WHERE incidents.id IN (SELECT id FROM expired);
	GET DIAGNOSTICS v_deleted = ROW_COUNT;
	RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_privacy_llm_call_incidents(integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_privacy_llm_call_incidents(integer) TO service_role;

COMMIT;
