-- supabase/migrations/20260924190000_privacy_retention.sql
-- Tasker 103 (RET): a named retention window for every derived and pass-through
-- store, enforced by the worker's daily retention job
-- (apps/worker/src/scheduler/privacyRetention.ts). Production has no pg_cron.
--
-- Every cleanup function is service-only, touches at most one bounded batch per
-- table per call, and returns only counts. The worker calls each one until a
-- batch affects nothing (or its time budget runs out), which replaces the old
-- one-call-a-day row caps.
--
-- Windows (the window lives in the function, so this file is the source of truth):
--   chat_turn_effects ................... 180-day hard ceiling, any state
--   chat_turn_runs request text ......... blanked 30 days after the turn ends
--   chat_turn_checkpoints ............... 30 days after last update
--   agentic_chat_execution_observations . 30 days
--   chat_turn_recovery_failures ......... 30 days (terminal turns only)
--   chat_turn_workflow_runs (+ steps, specialist snapshots/shadows,
--     document read batches by cascade) . 30 days after the turn ends
--   agentic_chat_answer_comparisons (+ candidates, votes) .. 90 days
--   chat_prompt_eval_runs (+ assertions) . 90 days
--   agent_tool_executions.result, agent_run_events.payload,
--     agent_call_tool_executions args/response/error ..... blanked after 30 days
--   llm_usage_logs 400 d; error_logs, notification_logs, cron_logs 90 d;
--   user_activity_logs 180 d; failed/cancelled queue_jobs 30 d;
--   visitors / email_tracking_events IP + user agent blanked after 30 d;
--   onto_public_page_views 90 d; security_logs: all rows (writer removed).
--   email_logs.body, system brief/notification emails.content, SMS bodies:
--     blanked 30 days after send.
--   calendar_analysis_events 7 d (redefined by 20260924190500: 30 d, and deleted
--     with their suggestion); calendar_project_suggestions 30 d after the
--     decision (or after the analysis, if never decided); calendar_analyses 30 d
--     after completion once no suggestion is left.
--   calendar_oauth_states / email_oauth_states: expiry + 1 day.
--   email_scan_checks: at expiry (global, not only per scanning user).
--   *_access_audit* tables: 180 days.
--   email_relevance scan runs and every child table: 30 days after the run ends.
--   agent_oauth codes and access tokens: expiry or revocation + 7 days;
--     refresh tokens: expiry + 7 days only (revoked rows keep reuse detection).
--   native_search_cache: expiry + 1 day.
--   web_page_visits 30 d after last visit; superseded web_page_versions 30 d.
--   Storage: unattached onto-assets chat-temp objects 24 h; brief-audio 30 d.
--
-- Also fixed here: the prepared-prompt cleanup deleted at most 50 rows per call.
--
-- Not touched on purpose (pending DJ): soft-deleted workspace rows and voice audio.

BEGIN;

-- ---------------------------------------------------------------------------
-- Existing machinery
-- ---------------------------------------------------------------------------

-- Was LIMIT 50, called about once a day. The worker now drains it through
-- cleanup_agentic_chat_prompt_artifacts; the batch stays bounded for lock time.
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
		LIMIT 500
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
	'Deletes up to 500 expired or consumed prepared prompts per call. The worker retention job calls it until a call deletes nothing.';

-- The 180-day ceiling lets retention remove effects that never resolved
-- (started/uncertain) or whose turn never ended. Younger rows keep every guard
-- from 20260820010000.
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
	IF OLD.created_at <= clock_timestamp() - interval '180 days' THEN
		RETURN OLD;
	END IF;

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

-- IP columns are blanked after 30 days; the rows stay for visitor counts.
-- DROP NOT NULL is a no-op where the column is already nullable.
ALTER TABLE public.visitors ALTER COLUMN ip_address DROP NOT NULL;
ALTER TABLE public.email_tracking_events ALTER COLUMN ip_address DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_privacy_chat_turn_effects(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT effects.id
		FROM public.chat_turn_effects effects
		WHERE effects.created_at <= clock_timestamp() - interval '180 days'
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.chat_turn_effects effects
	USING candidates
	WHERE effects.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('chat_turn_effects_deleted', v_deleted);
END;
$function$;

-- Only terminal turns: nothing reads request text after the turn ends except
-- admin views, which already fall back to an empty string. Both columns are
-- NOT NULL, so they are blanked rather than nulled.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_chat_turn_requests(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cleared integer := 0;
BEGIN
	WITH candidates AS (
		SELECT turns.id
		FROM public.chat_turn_runs turns
		WHERE turns.status IN ('completed', 'failed', 'cancelled')
			AND COALESCE(turns.terminalized_at, turns.finished_at, turns.created_at)
				<= clock_timestamp() - interval '30 days'
			AND (turns.request_message <> '' OR turns.request_payload <> '{}'::jsonb)
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	UPDATE public.chat_turn_runs turns
	SET request_message = '',
		request_payload = '{}'::jsonb
	FROM candidates
	WHERE turns.id = candidates.id;
	GET DIAGNOSTICS v_cleared = ROW_COUNT;

	RETURN jsonb_build_object('chat_turn_requests_cleared', v_cleared);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_privacy_chat_turn_checkpoints(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT checkpoints.id
		FROM public.chat_turn_checkpoints checkpoints
		WHERE checkpoints.updated_at <= clock_timestamp() - interval '30 days'
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.chat_turn_checkpoints checkpoints
	USING candidates
	WHERE checkpoints.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('chat_turn_checkpoints_deleted', v_deleted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_privacy_chat_execution_observations(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT observations.id
		FROM public.agentic_chat_execution_observations observations
		WHERE observations.observed_at <= clock_timestamp() - interval '30 days'
		LIMIT v_batch
	)
	DELETE FROM public.agentic_chat_execution_observations observations
	USING candidates
	WHERE observations.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('execution_observations_deleted', v_deleted);
END;
$function$;

-- A row for a turn that is still not terminal parks it for the recovery sweep;
-- deleting it would restart recovery, so only rows of ended turns go.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_chat_turn_recovery_failures(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT failures.turn_run_id
		FROM public.chat_turn_recovery_failures failures
		JOIN public.chat_turn_runs turns ON turns.id = failures.turn_run_id
		WHERE failures.last_failed_at <= clock_timestamp() - interval '30 days'
			AND turns.status IN ('completed', 'failed', 'cancelled')
		LIMIT v_batch
	)
	DELETE FROM public.chat_turn_recovery_failures failures
	USING candidates
	WHERE failures.turn_run_id = candidates.turn_run_id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('recovery_failures_deleted', v_deleted);
END;
$function$;

-- Steps, specialist snapshots, specialist selection shadows, and document read
-- batches cascade from the workflow run. Dispatch receipts have their own
-- function (cleanup_agentic_chat_workflow_dispatches_v1), now scheduled too.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_chat_workflow_runs(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 1000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT runs.turn_run_id
		FROM public.chat_turn_workflow_runs runs
		JOIN public.chat_turn_runs turns ON turns.id = runs.turn_run_id
		WHERE turns.status IN ('completed', 'failed', 'cancelled')
			AND COALESCE(turns.terminalized_at, turns.finished_at)
				<= clock_timestamp() - interval '30 days'
		LIMIT v_batch
		FOR UPDATE OF runs SKIP LOCKED
	)
	DELETE FROM public.chat_turn_workflow_runs runs
	USING candidates
	WHERE runs.turn_run_id = candidates.turn_run_id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('workflow_runs_deleted', v_deleted);
END;
$function$;

-- Candidates and votes cascade from the comparison.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_chat_answer_comparisons(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 1000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT comparisons.id
		FROM public.agentic_chat_answer_comparisons comparisons
		WHERE comparisons.created_at <= clock_timestamp() - interval '90 days'
		LIMIT v_batch
	)
	DELETE FROM public.agentic_chat_answer_comparisons comparisons
	USING candidates
	WHERE comparisons.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('answer_comparisons_deleted', v_deleted);
END;
$function$;

-- Assertions cascade from the eval run.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_chat_prompt_evals(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 1000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT runs.id
		FROM public.chat_prompt_eval_runs runs
		WHERE runs.created_at <= clock_timestamp() - interval '90 days'
		LIMIT v_batch
	)
	DELETE FROM public.chat_prompt_eval_runs runs
	USING candidates
	WHERE runs.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('prompt_eval_runs_deleted', v_deleted);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Agents: keep ids, op, and status; blank the content.
-- ---------------------------------------------------------------------------

-- agent_run_events.payload and agent_call_tool_executions.args are NOT NULL, so
-- they become '{}'. A succeeded MCP write older than 30 days can no longer be
-- replayed by idempotency key; the gateway answers "in progress" instead.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_agent_tool_payloads(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_tool_results integer := 0;
	v_run_events integer := 0;
	v_call_payloads integer := 0;
BEGIN
	WITH candidates AS (
		SELECT executions.id
		FROM public.agent_tool_executions executions
		WHERE executions.created_at <= v_cutoff
			AND executions.result IS NOT NULL
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	UPDATE public.agent_tool_executions executions
	SET result = NULL
	FROM candidates
	WHERE executions.id = candidates.id;
	GET DIAGNOSTICS v_tool_results = ROW_COUNT;

	WITH candidates AS (
		SELECT events.id
		FROM public.agent_run_events events
		WHERE events.created_at <= v_cutoff
			AND events.payload <> '{}'::jsonb
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	UPDATE public.agent_run_events events
	SET payload = '{}'::jsonb
	FROM candidates
	WHERE events.id = candidates.id;
	GET DIAGNOSTICS v_run_events = ROW_COUNT;

	WITH candidates AS (
		SELECT executions.id
		FROM public.agent_call_tool_executions executions
		WHERE executions.created_at <= v_cutoff
			AND (
				executions.args <> '{}'::jsonb
				OR executions.response_payload IS NOT NULL
				OR executions.error_payload IS NOT NULL
			)
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	UPDATE public.agent_call_tool_executions executions
	SET args = '{}'::jsonb,
		response_payload = NULL,
		error_payload = NULL
	FROM candidates
	WHERE executions.id = candidates.id;
	GET DIAGNOSTICS v_call_payloads = ROW_COUNT;

	RETURN jsonb_build_object(
		'agent_tool_results_cleared', v_tool_results,
		'agent_run_event_payloads_cleared', v_run_events,
		'agent_call_payloads_cleared', v_call_payloads
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Logs and analytics
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_privacy_llm_usage_logs(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT logs.id
		FROM public.llm_usage_logs logs
		WHERE logs.created_at <= clock_timestamp() - interval '400 days'
		LIMIT v_batch
	)
	DELETE FROM public.llm_usage_logs logs
	USING candidates
	WHERE logs.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('llm_usage_logs_deleted', v_deleted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_privacy_error_logs(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT logs.id
		FROM public.error_logs logs
		WHERE logs.created_at <= clock_timestamp() - interval '90 days'
		LIMIT v_batch
	)
	DELETE FROM public.error_logs logs
	USING candidates
	WHERE logs.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('error_logs_deleted', v_deleted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_privacy_notification_logs(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT logs.id
		FROM public.notification_logs logs
		WHERE logs.created_at <= clock_timestamp() - interval '90 days'
		LIMIT v_batch
	)
	DELETE FROM public.notification_logs logs
	USING candidates
	WHERE logs.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('notification_logs_deleted', v_deleted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_privacy_cron_logs(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT logs.id
		FROM public.cron_logs logs
		WHERE logs.executed_at <= clock_timestamp() - interval '90 days'
		LIMIT v_batch
	)
	DELETE FROM public.cron_logs logs
	USING candidates
	WHERE logs.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('cron_logs_deleted', v_deleted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_privacy_user_activity_logs(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT logs.id
		FROM public.user_activity_logs logs
		WHERE logs.created_at <= clock_timestamp() - interval '180 days'
		LIMIT v_batch
	)
	DELETE FROM public.user_activity_logs logs
	USING candidates
	WHERE logs.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('user_activity_logs_deleted', v_deleted);
END;
$function$;

-- Completed jobs already leave after 30 days through cleanupStaleJobs.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_queue_jobs(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT jobs.id
		FROM public.queue_jobs jobs
		WHERE jobs.status::text IN ('failed', 'cancelled')
			AND COALESCE(jobs.completed_at, jobs.updated_at, jobs.created_at)
				<= clock_timestamp() - interval '30 days'
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.queue_jobs jobs
	USING candidates
	WHERE jobs.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('failed_cancelled_jobs_deleted', v_deleted);
END;
$function$;

-- Rows stay (daily visitor and email engagement counts need them); the network
-- identifiers go.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_tracking_network_data(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_visitors integer := 0;
	v_tracking integer := 0;
BEGIN
	WITH candidates AS (
		SELECT visitors.id
		FROM public.visitors visitors
		WHERE GREATEST(visitors.created_at, visitors.updated_at) <= v_cutoff
			AND (visitors.ip_address IS NOT NULL OR visitors.user_agent IS NOT NULL)
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	UPDATE public.visitors visitors
	SET ip_address = NULL,
		user_agent = NULL
	FROM candidates
	WHERE visitors.id = candidates.id;
	GET DIAGNOSTICS v_visitors = ROW_COUNT;

	WITH candidates AS (
		SELECT events.id
		FROM public.email_tracking_events events
		WHERE COALESCE(events.created_at, events."timestamp", '-infinity'::timestamptz)
				<= v_cutoff
			AND (events.ip_address IS NOT NULL OR events.user_agent IS NOT NULL)
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	UPDATE public.email_tracking_events events
	SET ip_address = NULL,
		user_agent = NULL
	FROM candidates
	WHERE events.id = candidates.id;
	GET DIAGNOSTICS v_tracking = ROW_COUNT;

	RETURN jsonb_build_object(
		'visitors_network_cleared', v_visitors,
		'email_tracking_network_cleared', v_tracking
	);
END;
$function$;

-- view_count_all only ever increments, and the 30-day count is recomputed from
-- the last 30 days, so deleting 90-day-old rows changes no displayed number.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_public_page_views(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT views.id
		FROM public.onto_public_page_views views
		WHERE views.viewed_at <= clock_timestamp() - interval '90 days'
		LIMIT v_batch
	)
	DELETE FROM public.onto_public_page_views views
	USING candidates
	WHERE views.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('public_page_views_deleted', v_deleted);
END;
$function$;

-- The writer was removed on 2026-09-22; every remaining row is stale user input.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_security_logs(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT logs.id
		FROM public.security_logs logs
		LIMIT v_batch
	)
	DELETE FROM public.security_logs logs
	USING candidates
	WHERE logs.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('security_logs_deleted', v_deleted);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Sent messages: keep the delivery record, blank the body 30 days after send.
-- The body columns are NOT NULL, so they become ''.
-- ---------------------------------------------------------------------------

-- `emails` is limited to rows the notification pipeline wrote (category
-- daily_brief/notification). Admin-composed mail uses 'general', NULL, or a
-- campaign category and carries `sent_by_admin`; it is never touched.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_email_bodies(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 2000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_log_bodies integer := 0;
	v_email_bodies integer := 0;
BEGIN
	WITH candidates AS (
		SELECT logs.id
		FROM public.email_logs logs
		WHERE COALESCE(logs.sent_at, logs.created_at) <= v_cutoff
			AND logs.body <> ''
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	UPDATE public.email_logs logs
	SET body = ''
	FROM candidates
	WHERE logs.id = candidates.id;
	GET DIAGNOSTICS v_log_bodies = ROW_COUNT;

	WITH candidates AS (
		SELECT emails.id
		FROM public.emails emails
		WHERE emails.category IN ('daily_brief', 'notification')
			AND NOT (COALESCE(emails.template_data, '{}'::jsonb) ? 'sent_by_admin')
			AND emails.status IN ('sent', 'failed')
			AND COALESCE(emails.sent_at, emails.created_at, '-infinity'::timestamptz)
				<= v_cutoff
			AND emails.content <> ''
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	UPDATE public.emails emails
	SET content = ''
	FROM candidates
	WHERE emails.id = candidates.id;
	GET DIAGNOSTICS v_email_bodies = ROW_COUNT;

	RETURN jsonb_build_object(
		'email_log_bodies_cleared', v_log_bodies,
		'system_email_bodies_cleared', v_email_bodies
	);
END;
$function$;

-- scheduled_sms_messages also copies the calendar event title and details.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_sms_bodies(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_sms integer := 0;
	v_scheduled integer := 0;
BEGIN
	WITH candidates AS (
		SELECT messages.id
		FROM public.sms_messages messages
		WHERE messages.status::text IN ('sent', 'delivered', 'failed', 'undelivered', 'cancelled')
			AND COALESCE(messages.sent_at, messages.created_at, '-infinity'::timestamptz)
				<= v_cutoff
			AND (messages.message_content <> '' OR messages.template_vars IS NOT NULL)
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	UPDATE public.sms_messages messages
	SET message_content = '',
		template_vars = NULL
	FROM candidates
	WHERE messages.id = candidates.id;
	GET DIAGNOSTICS v_sms = ROW_COUNT;

	WITH candidates AS (
		SELECT messages.id
		FROM public.scheduled_sms_messages messages
		WHERE messages.status IN ('sent', 'delivered', 'failed', 'cancelled')
			AND COALESCE(messages.sent_at, messages.cancelled_at, messages.scheduled_for)
				<= v_cutoff
			AND (
				messages.message_content <> ''
				OR messages.event_title IS NOT NULL
				OR messages.event_details IS NOT NULL
			)
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	UPDATE public.scheduled_sms_messages messages
	SET message_content = '',
		event_title = NULL,
		event_details = NULL
	FROM candidates
	WHERE messages.id = candidates.id;
	GET DIAGNOSTICS v_scheduled = ROW_COUNT;

	RETURN jsonb_build_object(
		'sms_bodies_cleared', v_sms,
		'scheduled_sms_bodies_cleared', v_scheduled
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Calendar
-- ---------------------------------------------------------------------------

-- Mirrors of outside Google events. Suggestions keep their own copies, so a
-- completed analysis still renders and accepts without these rows. Failed or
-- stuck analyses never set completed_at, hence the created_at rule.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_calendar_analysis_events(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '7 days';
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT events.id
		FROM public.calendar_analysis_events events
		WHERE COALESCE(events.created_at, '-infinity'::timestamptz) <= v_cutoff
			OR EXISTS (
				SELECT 1
				FROM public.calendar_analyses analyses
				WHERE analyses.id = events.analysis_id
					AND analyses.completed_at <= v_cutoff
			)
		LIMIT v_batch
	)
	DELETE FROM public.calendar_analysis_events events
	USING candidates
	WHERE events.id = candidates.id;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('calendar_analysis_events_deleted', v_deleted);
END;
$function$;

-- Decided suggestions go 30 days after the decision; undecided ones 30 days
-- after their analysis. An analysis goes 30 days after completion once it has
-- no suggestion or event rows left, so a late decision keeps its full window.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_calendar_analyses(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_suggestions integer := 0;
	v_analyses integer := 0;
BEGIN
	WITH candidates AS (
		SELECT suggestions.id
		FROM public.calendar_project_suggestions suggestions
		JOIN public.calendar_analyses analyses ON analyses.id = suggestions.analysis_id
		WHERE (
				suggestions.status IN ('accepted', 'rejected', 'modified', 'deferred')
				AND COALESCE(
					suggestions.status_changed_at,
					suggestions.updated_at,
					suggestions.created_at,
					'-infinity'::timestamptz
				) <= v_cutoff
			)
			OR (
				COALESCE(suggestions.status, 'pending') IN ('pending', 'processing')
				AND COALESCE(
					analyses.completed_at,
					analyses.created_at,
					'-infinity'::timestamptz
				) <= v_cutoff
			)
		LIMIT v_batch
	)
	DELETE FROM public.calendar_project_suggestions suggestions
	USING candidates
	WHERE suggestions.id = candidates.id;
	GET DIAGNOSTICS v_suggestions = ROW_COUNT;

	WITH candidates AS (
		SELECT analyses.id
		FROM public.calendar_analyses analyses
		WHERE COALESCE(analyses.completed_at, analyses.created_at, '-infinity'::timestamptz)
				<= v_cutoff
			AND NOT EXISTS (
				SELECT 1
				FROM public.calendar_project_suggestions suggestions
				WHERE suggestions.analysis_id = analyses.id
			)
			AND NOT EXISTS (
				SELECT 1
				FROM public.calendar_analysis_events events
				WHERE events.analysis_id = analyses.id
			)
		LIMIT v_batch
	)
	DELETE FROM public.calendar_analyses analyses
	USING candidates
	WHERE analyses.id = candidates.id;
	GET DIAGNOSTICS v_analyses = ROW_COUNT;

	RETURN jsonb_build_object(
		'calendar_suggestions_deleted', v_suggestions,
		'calendar_analyses_deleted', v_analyses
	);
END;
$function$;

-- The Gmail flow only swept its own states when a new flow started.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_oauth_states(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '1 day';
	v_calendar integer := 0;
	v_email integer := 0;
BEGIN
	WITH candidates AS (
		SELECT states.id
		FROM public.calendar_oauth_states states
		WHERE states.expires_at <= v_cutoff
		LIMIT v_batch
	)
	DELETE FROM public.calendar_oauth_states states
	USING candidates
	WHERE states.id = candidates.id;
	GET DIAGNOSTICS v_calendar = ROW_COUNT;

	WITH candidates AS (
		SELECT states.id
		FROM public.email_oauth_states states
		WHERE states.expires_at <= v_cutoff
		LIMIT v_batch
	)
	DELETE FROM public.email_oauth_states states
	USING candidates
	WHERE states.id = candidates.id;
	GET DIAGNOSTICS v_email = ROW_COUNT;

	RETURN jsonb_build_object(
		'calendar_oauth_states_deleted', v_calendar,
		'email_oauth_states_deleted', v_email
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Gmail and connectors
-- ---------------------------------------------------------------------------

-- Replaces the per-user sweep that only ran during that user's next scan.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_email_scan_checks(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT checks.user_id, checks.connection_id, checks.scope_key, checks.message_key
		FROM public.email_scan_checks checks
		WHERE checks.expires_at <= clock_timestamp()
		LIMIT v_batch
	)
	DELETE FROM public.email_scan_checks checks
	USING candidates
	WHERE checks.user_id = candidates.user_id
		AND checks.connection_id = candidates.connection_id
		AND checks.scope_key = candidates.scope_key
		AND checks.message_key = candidates.message_key;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('email_scan_checks_deleted', v_deleted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_privacy_access_audits(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '180 days';
	v_email integer := 0;
	v_calendar integer := 0;
	v_profile integer := 0;
	v_contact integer := 0;
BEGIN
	WITH candidates AS (
		SELECT audits.id FROM public.email_access_audit_events audits
		WHERE audits.created_at <= v_cutoff
		LIMIT v_batch
	)
	DELETE FROM public.email_access_audit_events audits
	USING candidates WHERE audits.id = candidates.id;
	GET DIAGNOSTICS v_email = ROW_COUNT;

	WITH candidates AS (
		SELECT audits.id FROM public.calendar_access_audit_events audits
		WHERE audits.created_at <= v_cutoff
		LIMIT v_batch
	)
	DELETE FROM public.calendar_access_audit_events audits
	USING candidates WHERE audits.id = candidates.id;
	GET DIAGNOSTICS v_calendar = ROW_COUNT;

	WITH candidates AS (
		SELECT audits.id FROM public.profile_access_audit audits
		WHERE audits.created_at <= v_cutoff
		LIMIT v_batch
	)
	DELETE FROM public.profile_access_audit audits
	USING candidates WHERE audits.id = candidates.id;
	GET DIAGNOSTICS v_profile = ROW_COUNT;

	WITH candidates AS (
		SELECT audits.id FROM public.user_contact_access_audit audits
		WHERE audits.created_at <= v_cutoff
		LIMIT v_batch
	)
	DELETE FROM public.user_contact_access_audit audits
	USING candidates WHERE audits.id = candidates.id;
	GET DIAGNOSTICS v_contact = ROW_COUNT;

	RETURN jsonb_build_object(
		'email_access_audit_events_deleted', v_email,
		'calendar_access_audit_events_deleted', v_calendar,
		'profile_access_audit_deleted', v_profile,
		'user_contact_access_audit_deleted', v_contact
	);
END;
$function$;

-- A run ends at completed_at, or at expires_at (at most 24 h after creation) if
-- it never completed. Children go first, in this order, because deleting an
-- observation marks its review sample expired: removing samples first keeps
-- that trigger from updating rows the same cascade is deleting. Scope, project,
-- and reservation rows then cascade from the run. Observations and candidates
-- keep their own 7-day purge (web cron).
CREATE OR REPLACE FUNCTION public.cleanup_privacy_email_relevance_runs(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_runs_per_call integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 50);
	v_run_ids uuid[];
	v_samples integer := 0;
	v_observations integer := 0;
	v_runs integer := 0;
BEGIN
	SELECT COALESCE(array_agg(expired.id), ARRAY[]::uuid[])
	INTO v_run_ids
	FROM (
		SELECT runs.id
		FROM public.email_relevance_scan_runs runs
		WHERE COALESCE(runs.completed_at, runs.expires_at)
			<= clock_timestamp() - interval '30 days'
		LIMIT v_runs_per_call
		FOR UPDATE SKIP LOCKED
	) AS expired;

	IF cardinality(v_run_ids) = 0 THEN
		RETURN jsonb_build_object(
			'email_relevance_samples_deleted', 0,
			'email_relevance_observations_deleted', 0,
			'email_relevance_runs_deleted', 0
		);
	END IF;

	DELETE FROM public.email_relevance_review_samples samples
	WHERE samples.run_id = ANY (v_run_ids);
	GET DIAGNOSTICS v_samples = ROW_COUNT;

	DELETE FROM public.email_relevance_message_observations observations
	WHERE observations.run_id = ANY (v_run_ids);
	GET DIAGNOSTICS v_observations = ROW_COUNT;

	DELETE FROM public.email_relevance_scan_runs runs
	WHERE runs.id = ANY (v_run_ids);
	GET DIAGNOSTICS v_runs = ROW_COUNT;

	RETURN jsonb_build_object(
		'email_relevance_samples_deleted', v_samples,
		'email_relevance_observations_deleted', v_observations,
		'email_relevance_runs_deleted', v_runs
	);
END;
$function$;

-- Moved from the web security-events cron, which is not scheduled. Refresh
-- tokens are deleted only after expiry, never on revocation alone: a rotated
-- token is revoked, and keeping it lets a replay burn its family.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_agent_oauth_artifacts(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_cutoff timestamptz := clock_timestamp() - interval '7 days';
	v_codes integer := 0;
	v_access integer := 0;
	v_refresh integer := 0;
BEGIN
	WITH candidates AS (
		SELECT codes.id
		FROM public.agent_oauth_authorization_codes codes
		WHERE codes.expires_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.agent_oauth_authorization_codes codes
	USING candidates
	WHERE codes.id = candidates.id;
	GET DIAGNOSTICS v_codes = ROW_COUNT;

	WITH candidates AS (
		SELECT tokens.id
		FROM public.agent_oauth_access_tokens tokens
		WHERE tokens.expires_at <= v_cutoff
			OR tokens.revoked_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.agent_oauth_access_tokens tokens
	USING candidates
	WHERE tokens.id = candidates.id;
	GET DIAGNOSTICS v_access = ROW_COUNT;

	WITH candidates AS (
		SELECT tokens.id
		FROM public.agent_oauth_refresh_tokens tokens
		WHERE tokens.expires_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.agent_oauth_refresh_tokens tokens
	USING candidates
	WHERE tokens.id = candidates.id;
	GET DIAGNOSTICS v_refresh = ROW_COUNT;

	RETURN jsonb_build_object(
		'authorization_codes_deleted', v_codes,
		'access_tokens_deleted', v_access,
		'refresh_tokens_deleted', v_refresh
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Web
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cleanup_privacy_native_search_cache(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 5000);
	v_deleted integer := 0;
BEGIN
	WITH candidates AS (
		SELECT cache.cache_key
		FROM public.native_search_cache cache
		WHERE cache.expires_at <= clock_timestamp() - interval '1 day'
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.native_search_cache cache
	USING candidates
	WHERE cache.cache_key = candidates.cache_key;
	GET DIAGNOSTICS v_deleted = ROW_COUNT;

	RETURN jsonb_build_object('native_search_cache_deleted', v_deleted);
END;
$function$;

-- A visit untouched for 30 days goes with its versions and evidence chunks
-- (cascade). Older superseded versions of a page still in use go too; the
-- current version stays with its visit.
CREATE OR REPLACE FUNCTION public.cleanup_privacy_web_page_evidence(
	p_batch_size integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_batch integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 1000);
	v_cutoff timestamptz := clock_timestamp() - interval '30 days';
	v_visits integer := 0;
	v_versions integer := 0;
BEGIN
	WITH candidates AS (
		SELECT visits.id
		FROM public.web_page_visits visits
		WHERE visits.last_visited_at <= v_cutoff
		LIMIT v_batch
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM public.web_page_visits visits
	USING candidates
	WHERE visits.id = candidates.id;
	GET DIAGNOSTICS v_visits = ROW_COUNT;

	WITH candidates AS (
		SELECT versions.id
		FROM public.web_page_versions versions
		WHERE versions.created_at <= v_cutoff
			AND NOT EXISTS (
				SELECT 1
				FROM public.web_page_visits visits
				WHERE visits.current_version_id = versions.id
			)
		LIMIT v_batch
	)
	DELETE FROM public.web_page_versions versions
	USING candidates
	WHERE versions.id = candidates.id;
	GET DIAGNOSTICS v_versions = ROW_COUNT;

	RETURN jsonb_build_object(
		'web_page_visits_deleted', v_visits,
		'web_page_versions_deleted', v_versions
	);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Storage candidates. SQL decides what may go (by path, age, and a structural
-- attachment reference); the worker deletes through the Storage API so the
-- object bytes go with the row.
-- ---------------------------------------------------------------------------

-- Chat images upload to users/{uid}/chat-temp/{tempId}/original.{ext}. An image
-- is attached once a chat_message_attachments row names its temporary id.
CREATE OR REPLACE FUNCTION public.list_privacy_chat_temp_orphans(
	p_limit integer DEFAULT 200
)
RETURNS TABLE (object_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
	RETURN QUERY
	SELECT objects.name
	FROM storage.objects objects
	WHERE objects.bucket_id = 'onto-assets'
		AND objects.name LIKE 'users/%/chat-temp/%'
		AND objects.created_at <= clock_timestamp() - interval '24 hours'
		AND NOT EXISTS (
			SELECT 1
			FROM public.chat_message_attachments attachments
			WHERE attachments.attachment_kind = 'temporary_file'
				AND (
					attachments.metadata->>'temporary_attachment_id'
						= split_part(objects.name, '/', 4)
					OR attachments.metadata->>'storage_path' = objects.name
				)
		)
		AND NOT EXISTS (
			SELECT 1
			FROM public.onto_assets assets
			WHERE assets.storage_path = objects.name
		)
	ORDER BY objects.created_at, objects.name
	LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
END;
$function$;

-- Resets each brief that points at an expiring object the way resetAudioState
-- does (status 'none' hides the player), then returns the object names for the
-- worker to delete. Briefs whose narration is being generated are left alone.
CREATE OR REPLACE FUNCTION public.claim_privacy_expired_brief_audio(
	p_limit integer DEFAULT 200
)
RETURNS TABLE (object_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
	v_names text[];
BEGIN
	SELECT COALESCE(array_agg(expired.name), ARRAY[]::text[])
	INTO v_names
	FROM (
		SELECT objects.name
		FROM storage.objects objects
		WHERE objects.bucket_id = 'brief-audio'
			AND GREATEST(objects.created_at, COALESCE(objects.updated_at, objects.created_at))
				<= clock_timestamp() - interval '30 days'
			AND NOT EXISTS (
				SELECT 1
				FROM public.ontology_daily_briefs briefs
				WHERE briefs.audio_storage_path = objects.name
					AND briefs.audio_status IN ('pending', 'generating')
			)
		ORDER BY objects.created_at, objects.name
		LIMIT LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000)
	) AS expired;

	UPDATE public.ontology_daily_briefs briefs
	SET audio_status = 'none',
		audio_storage_path = NULL,
		audio_voice = NULL,
		audio_model = NULL,
		audio_duration_ms = NULL,
		audio_generation_ms = NULL,
		audio_requested_at = NULL,
		audio_generation_started_at = NULL,
		audio_generated_at = NULL,
		audio_error = NULL
	WHERE briefs.audio_storage_path = ANY (v_names);

	RETURN QUERY SELECT unnest(v_names);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Grants: service_role only, like the existing cleanup functions.
-- ---------------------------------------------------------------------------

DO $grants$
DECLARE
	v_signature text;
BEGIN
	FOREACH v_signature IN ARRAY ARRAY[
		'public.cleanup_privacy_chat_turn_effects(integer)',
		'public.cleanup_privacy_chat_turn_requests(integer)',
		'public.cleanup_privacy_chat_turn_checkpoints(integer)',
		'public.cleanup_privacy_chat_execution_observations(integer)',
		'public.cleanup_privacy_chat_turn_recovery_failures(integer)',
		'public.cleanup_privacy_chat_workflow_runs(integer)',
		'public.cleanup_privacy_chat_answer_comparisons(integer)',
		'public.cleanup_privacy_chat_prompt_evals(integer)',
		'public.cleanup_privacy_agent_tool_payloads(integer)',
		'public.cleanup_privacy_llm_usage_logs(integer)',
		'public.cleanup_privacy_error_logs(integer)',
		'public.cleanup_privacy_notification_logs(integer)',
		'public.cleanup_privacy_cron_logs(integer)',
		'public.cleanup_privacy_user_activity_logs(integer)',
		'public.cleanup_privacy_queue_jobs(integer)',
		'public.cleanup_privacy_tracking_network_data(integer)',
		'public.cleanup_privacy_public_page_views(integer)',
		'public.cleanup_privacy_security_logs(integer)',
		'public.cleanup_privacy_email_bodies(integer)',
		'public.cleanup_privacy_sms_bodies(integer)',
		'public.cleanup_privacy_calendar_analysis_events(integer)',
		'public.cleanup_privacy_calendar_analyses(integer)',
		'public.cleanup_privacy_oauth_states(integer)',
		'public.cleanup_privacy_email_scan_checks(integer)',
		'public.cleanup_privacy_access_audits(integer)',
		'public.cleanup_privacy_email_relevance_runs(integer)',
		'public.cleanup_privacy_agent_oauth_artifacts(integer)',
		'public.cleanup_privacy_native_search_cache(integer)',
		'public.cleanup_privacy_web_page_evidence(integer)',
		'public.list_privacy_chat_temp_orphans(integer)',
		'public.claim_privacy_expired_brief_audio(integer)'
	]
	LOOP
		EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature);
		EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
	END LOOP;
END;
$grants$;

COMMIT;
