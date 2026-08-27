-- supabase/migrations/20260827132854_query_performance_cleanup.sql
-- Query-performance cleanup based on the production pg_stat_statements and
-- advisor snapshot from 2026-08-27.
--
-- This migration intentionally avoids mass-dropping "unused" indexes: the
-- production statistics window was only ~15 days. Every index removed below is
-- an exact duplicate with an equivalent index left in place.

-- The chat-session detail endpoint filters by both ownership columns and then
-- renders events chronologically. This replaces its sequential scan + sort.
CREATE INDEX IF NOT EXISTS idx_chat_turn_events_session_user_created
	ON public.chat_turn_events (session_id, user_id, created_at);

-- Remove exact duplicate indexes while preserving the constraint-backed unique
-- index and one equivalent planner path for every other pair.
DROP INDEX IF EXISTS public.idx_error_logs_created_at_desc;
DROP INDEX IF EXISTS public.idx_failed_payments_invoice;
DROP INDEX IF EXISTS public.idx_llm_usage_logs_chat_session;
DROP INDEX IF EXISTS public.idx_llm_usage_logs_project;
DROP INDEX IF EXISTS public.idx_notif_deliveries_event_id;
DROP INDEX IF EXISTS public.idx_onto_risks_search;
DROP INDEX IF EXISTS public.uq_ontology_project_briefs_daily_brief_project;
DROP INDEX IF EXISTS public.idx_phase_tasks_phase;
DROP INDEX IF EXISTS public.idx_phase_tasks_lookup;
DROP INDEX IF EXISTS public.idx_phase_tasks_task;
DROP INDEX IF EXISTS public.idx_phases_project_id;
DROP INDEX IF EXISTS public.idx_phases_project_order;
DROP INDEX IF EXISTS public.idx_projects_search_context;
DROP INDEX IF EXISTS public.idx_projects_search_description;
DROP INDEX IF EXISTS public.idx_projects_search_executive_summary;
DROP INDEX IF EXISTS public.idx_projects_search_name;
DROP INDEX IF EXISTS public.idx_task_calendar_events_task;
DROP INDEX IF EXISTS public.idx_task_calendar_events_user;
DROP INDEX IF EXISTS public.idx_tasks_project_outdated;
DROP INDEX IF EXISTS public.idx_tasks_synthesis;
DROP INDEX IF EXISTS public.idx_tasks_search_description;
DROP INDEX IF EXISTS public.idx_tasks_search_details;
DROP INDEX IF EXISTS public.idx_tasks_search_task_steps;
DROP INDEX IF EXISTS public.idx_tasks_title_trgm;

-- Supabase's service_role has BYPASSRLS. Service-only policies therefore never
-- grant it additional access, but policies written TO PUBLIC still add auth
-- function checks to every other role and generate init-plan warnings. Remove
-- only policies whose complete predicate is a service-role check; mixed user or
-- admin policies are deliberately left untouched.
DO $cleanup_redundant_service_policies$
DECLARE
	v_policy record;
	v_service_role_bypasses_rls boolean;
BEGIN
	SELECT rolbypassrls
	INTO v_service_role_bypasses_rls
	FROM pg_roles
	WHERE rolname = 'service_role';

	IF v_service_role_bypasses_rls IS DISTINCT FROM true THEN
		RAISE EXCEPTION 'Expected Supabase service_role to have BYPASSRLS';
	END IF;

	FOR v_policy IN
		SELECT schemaname, tablename, policyname
		FROM pg_policies
		WHERE schemaname = 'public'
			AND roles = ARRAY['public']::name[]
			AND (
				qual IN (
					'(auth.role() = ''service_role''::text)',
					'((auth.jwt() ->> ''role''::text) = ''service_role''::text)'
				)
				OR with_check IN (
					'(auth.role() = ''service_role''::text)',
					'((auth.jwt() ->> ''role''::text) = ''service_role''::text)'
				)
			)
			AND (
				qual IS NULL
				OR qual IN (
					'(auth.role() = ''service_role''::text)',
					'((auth.jwt() ->> ''role''::text) = ''service_role''::text)'
				)
			)
			AND (
				with_check IS NULL
				OR with_check IN (
					'(auth.role() = ''service_role''::text)',
					'((auth.jwt() ->> ''role''::text) = ''service_role''::text)'
				)
			)
	LOOP
		EXECUTE format(
			'DROP POLICY IF EXISTS %I ON %I.%I',
			v_policy.policyname,
			v_policy.schemaname,
			v_policy.tablename
		);
	END LOOP;
END;
$cleanup_redundant_service_policies$;

-- The list heartbeat is one of the busiest application queries. Consolidating
-- its two permissive SELECT policies removes duplicate policy evaluation and
-- wrapping auth.uid() makes PostgreSQL compute it once per statement.
DROP POLICY IF EXISTS agent_runs_admin_select ON public.agent_runs;
DROP POLICY IF EXISTS agent_runs_user_select ON public.agent_runs;
DROP POLICY IF EXISTS agent_runs_authenticated_select ON public.agent_runs;

CREATE POLICY agent_runs_authenticated_select
	ON public.agent_runs
	FOR SELECT
	TO authenticated
	USING (
		user_id = (SELECT auth.uid())
		OR EXISTS (
			SELECT 1
			FROM public.admin_users
			WHERE admin_users.user_id = (SELECT auth.uid())
		)
	);

-- Prepared prompts contain large JSON payloads. Bound each cleanup transaction
-- so a backlog cannot create a long delete lock or a large latency spike.
CREATE OR REPLACE FUNCTION public.cleanup_expired_agentic_chat_prepared_prompts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
	v_deleted integer;
BEGIN
	WITH expired AS (
		SELECT prompt.id
		FROM public.agentic_chat_prepared_prompts AS prompt
		WHERE prompt.expires_at < now() - interval '10 minutes'
			OR prompt.consumed_at < now() - interval '10 minutes'
		ORDER BY LEAST(prompt.expires_at, prompt.consumed_at) NULLS LAST, prompt.id
		LIMIT 50
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.agentic_chat_prepared_prompts AS prompt
	USING expired
	WHERE prompt.id = expired.id;

	GET DIAGNOSTICS v_deleted = ROW_COUNT;
	RETURN v_deleted;
END;
$function$;

COMMENT ON FUNCTION public.cleanup_expired_agentic_chat_prepared_prompts() IS
	'Deletes up to 50 expired or consumed prepared prompts per call to bound cleanup locks and latency.';
