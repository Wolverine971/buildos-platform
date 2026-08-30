-- supabase/migrations/20260830010000_agentic_chat_track_i_hardening.sql
-- Agentic Chat Wave 3 / Track I: account-scoped page evidence, bounded
-- sensitive transcript retention, and an atomic legacy per-user running cap.

BEGIN;

-- S16: fetched page bodies can be personalized even when the URL looks public.
-- Discovery metadata may be shared elsewhere, but body snapshots are private to
-- the account that fetched them.
ALTER TABLE public.web_page_visits
	ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.users(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.idx_web_page_visits_normalized_url;
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_page_visits_user_normalized_url
	ON public.web_page_visits (user_id, normalized_url)
	WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_page_visits_user_last_visited
	ON public.web_page_visits (user_id, last_visited_at DESC)
	WHERE user_id IS NOT NULL;

ALTER TABLE public.web_page_visits
	DROP CONSTRAINT IF EXISTS web_page_visits_user_scope_required,
	ADD CONSTRAINT web_page_visits_user_scope_required
	CHECK (user_id IS NOT NULL) NOT VALID;

DROP POLICY IF EXISTS "Authenticated users can read web page visits"
	ON public.web_page_visits;
DROP POLICY IF EXISTS web_page_visits_owner_select
	ON public.web_page_visits;
CREATE POLICY web_page_visits_owner_select
	ON public.web_page_visits
	FOR SELECT
	TO authenticated
	USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.web_page_visits IS
	'Per-user deduped web page markdown snapshots with metadata and visit metrics. Rows without user_id predate account scoping and are inaccessible to authenticated clients.';
COMMENT ON COLUMN public.web_page_visits.user_id IS
	'Account boundary for fetched page bodies. Service clients must include this on every new row.';

-- S11: tool arguments/results and turn event payloads contain user-authored and
-- externally-authored content. Retain terminal audit evidence for 30 days, then
-- delete it in bounded batches. Active/nonterminal turns are never candidates.
CREATE OR REPLACE FUNCTION public.cleanup_agentic_chat_sensitive_transcripts(
	p_retention_days integer DEFAULT 30,
	p_batch_size integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_retention_days integer := GREATEST(COALESCE(p_retention_days, 30), 30);
	v_batch_size integer := GREATEST(LEAST(COALESCE(p_batch_size, 1000), 10000), 1);
	v_tool_executions_deleted integer := 0;
	v_turn_events_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT executions.id
		FROM public.chat_tool_executions executions
		LEFT JOIN public.chat_turn_runs turns ON turns.id = executions.turn_run_id
		WHERE executions.created_at <= clock_timestamp()
				- make_interval(days => v_retention_days)
			AND (
				executions.turn_run_id IS NULL
				OR (
					turns.status IN ('completed', 'failed', 'cancelled')
					AND COALESCE(turns.terminalized_at, turns.finished_at)
						<= clock_timestamp() - make_interval(days => v_retention_days)
				)
			)
		ORDER BY executions.created_at, executions.id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_tool_executions executions
	WHERE executions.id IN (SELECT id FROM candidates);
	GET DIAGNOSTICS v_tool_executions_deleted = ROW_COUNT;

	WITH candidates AS (
		SELECT events.id
		FROM public.chat_turn_events events
		JOIN public.chat_turn_runs turns ON turns.id = events.turn_run_id
		WHERE events.created_at <= clock_timestamp()
				- make_interval(days => v_retention_days)
			AND turns.status IN ('completed', 'failed', 'cancelled')
			AND COALESCE(turns.terminalized_at, turns.finished_at)
				<= clock_timestamp() - make_interval(days => v_retention_days)
		ORDER BY events.created_at, events.id
		LIMIT v_batch_size
	)
	DELETE FROM public.chat_turn_events events
	WHERE events.id IN (SELECT id FROM candidates);
	GET DIAGNOSTICS v_turn_events_deleted = ROW_COUNT;

	RETURN jsonb_build_object(
		'tool_executions_deleted', v_tool_executions_deleted,
		'turn_events_deleted', v_turn_events_deleted,
		'retention_days', v_retention_days,
		'batch_size', v_batch_size
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_agentic_chat_sensitive_transcripts(integer, integer)
	FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_agentic_chat_sensitive_transcripts(integer, integer)
	TO service_role;

COMMENT ON FUNCTION public.cleanup_agentic_chat_sensitive_transcripts(integer, integer) IS
	'Bounded service-only 30-day cleanup for terminal chat tool arguments/results and turn event payloads.';

-- S6: patch the service-only legacy admission transaction after duplicate and
-- same-session stale-turn resolution. The existing per-user advisory lock makes
-- this count-and-insert capacity decision atomic across concurrent admissions.
DO $migration$
DECLARE
	v_definition text;
	v_patched text;
	v_needle text := E'\t-- Capture the current fallback window before the new message exists.';
	v_capacity_gate text := E'\tIF (\n\t\tSELECT count(*)\n\t\tFROM public.chat_turn_runs turns\n\t\tWHERE turns.user_id = p_user_id\n\t\t\tAND turns.status = ''running''\n\t) >= 2 THEN\n\t\tRETURN jsonb_build_object(\n\t\t\t''outcome'', ''capacity_exceeded'',\n\t\t\t''execution_may_start'', false,\n\t\t\t''running_count'', (\n\t\t\t\tSELECT count(*)\n\t\t\t\tFROM public.chat_turn_runs turns\n\t\t\t\tWHERE turns.user_id = p_user_id\n\t\t\t\t\tAND turns.status = ''running''\n\t\t\t),\n\t\t\t''retry_after_seconds'', 5\n\t\t);\n\tEND IF;\n\n';
BEGIN
	SELECT pg_get_functiondef(procedures.oid)
	INTO STRICT v_definition
	FROM pg_catalog.pg_proc procedures
	JOIN pg_catalog.pg_namespace namespaces ON namespaces.oid = procedures.pronamespace
	WHERE namespaces.nspname = 'public'
		AND procedures.proname = 'admit_legacy_agentic_chat_turn'
		AND procedures.pronargs = 21;

	IF position(v_needle IN v_definition) = 0
		OR position('''outcome'', ''capacity_exceeded''' IN v_definition) > 0 THEN
		RAISE EXCEPTION 'agentic_chat_legacy_capacity_preflight_failed';
	END IF;
	v_patched := replace(v_definition, v_needle, v_capacity_gate || v_needle);
	IF v_patched = v_definition
		OR position('''outcome'', ''capacity_exceeded''' IN v_patched) = 0 THEN
		RAISE EXCEPTION 'agentic_chat_legacy_capacity_patch_failed';
	END IF;
	EXECUTE v_patched;
END;
$migration$;

COMMENT ON FUNCTION public.admit_legacy_agentic_chat_turn(
	uuid, uuid, uuid, uuid, text, text, text, text, text, uuid, uuid, text,
	boolean, text, timestamptz, text, jsonb, integer, integer, integer, integer
) IS
	'Service-only duplicate-first legacy admission with atomic per-user max-running=2 capacity enforcement.';

COMMIT;
